import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// `better-sqlite3` is a CJS `export =` module; this project doesn't enable
// `esModuleInterop`, so a default import here would type-check but silently
// resolve to `undefined` at runtime — use the TS import-equals form instead.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Database = require('better-sqlite3');
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectsService } from '@/modules/projects/projects.service';
import { S3Service } from '@/modules/s3/s3.service';
import { SchemaSandboxEntity } from './entity/schema-sandbox.entity';
import { provisionSandbox, syncSandbox } from './sandbox-sync';
import { PhysicalModelPayload, SyncReportEntry } from './sandbox.types';

export interface SandboxStatus {
  exists: boolean;
  inSync: boolean;
  lastUsedAt: Date | null;
  createdAt: Date | null;
}

export interface SandboxQueryResult {
  success: boolean;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
  executionTimeMs: number;
  message?: string;
  syncReport?: SyncReportEntry[];
}

interface SandboxHandle {
  db: Database.Database;
  filePath: string;
  lastUsed: number;
}

const IDLE_EVICT_MS = 15 * 60 * 1000; // close in-process handles unused for 15 min — S3 copy stays as the durable source of truth
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function hashModel(model: unknown): string {
  const json = JSON.stringify(canonicalize(model));
  return crypto.createHash('sha256').update(json).digest('hex');
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly handles = new Map<string, SandboxHandle>();
  private readonly tmpDir = path.join(os.tmpdir(), 'dbflow-sandboxes');

  constructor(
    @InjectRepository(SchemaSandboxEntity)
    private readonly sandboxRepo: Repository<SchemaSandboxEntity>,
    private readonly projectsService: ProjectsService,
    private readonly s3Service: S3Service,
  ) {
    fs.mkdirSync(this.tmpDir, { recursive: true });
    setInterval(() => this.evictIdleHandles(), SWEEP_INTERVAL_MS).unref();
  }

  private filePathFor(schemaId: string): string {
    return path.join(this.tmpDir, `${schemaId}.sqlite`);
  }

  private s3KeyFor(schemaId: string): string {
    return `sandboxes/${schemaId}/sandbox.sqlite`;
  }

  private modelSnapshotKeyFor(schemaId: string): string {
    return `sandboxes/${schemaId}/built-from-model.json`;
  }

  private openHandle(schemaId: string, filePath: string): SandboxHandle {
    const db = new Database(filePath);
    db.pragma('foreign_keys = ON');
    const handle: SandboxHandle = { db, filePath, lastUsed: Date.now() };
    this.handles.set(schemaId, handle);
    return handle;
  }

  private evictIdleHandles(): void {
    const now = Date.now();
    for (const [schemaId, handle] of this.handles) {
      if (now - handle.lastUsed > IDLE_EVICT_MS) {
        try {
          handle.db.close();
        } catch {
          /* ignore */
        }
        this.handles.delete(schemaId);
        this.logger.debug(`Evicted idle sandbox handle for schema ${schemaId}`);
      }
    }
  }

  private async persistToS3(
    schemaId: string,
    projectId: string,
    filePath: string,
    model: Record<string, unknown>,
    hash: string,
  ): Promise<void> {
    const buffer = fs.readFileSync(filePath);
    const s3Key = this.s3KeyFor(schemaId);
    const modelSnapshotS3Key = this.modelSnapshotKeyFor(schemaId);

    await Promise.all([
      this.s3Service.putObject(s3Key, buffer, 'application/x-sqlite3'),
      this.s3Service.putJsonObject(modelSnapshotS3Key, model),
    ]);

    await this.sandboxRepo.upsert(
      {
        schemaId,
        projectId,
        s3Key,
        modelSnapshotS3Key,
        builtFromModelHash: hash,
        lastUsedAt: new Date(),
      },
      ['schemaId'],
    );
  }

  /**
   * Ensure a sandbox exists for `schemaId` and is in sync with the current
   * live model.json, provisioning/migrating as needed. Returns the open
   * database handle plus a sync report when provisioning or drift-migration
   * occurred (undefined on the common "already in sync" path).
   */
  private async ensureSyncedSandbox(
    projectId: string,
    schemaId: string,
  ): Promise<{ db: Database.Database; syncReport?: SyncReportEntry[] }> {
    const currentModel = await this.projectsService.getCurrentSchemaModel(
      projectId,
      schemaId,
    );
    if (!currentModel) {
      throw new BadRequestException(
        'No physical schema model found for this schema — save your diagram first.',
      );
    }
    const currentHash = hashModel(currentModel);
    const model = currentModel as unknown as PhysicalModelPayload;

    const entity = await this.sandboxRepo.findOne({ where: { schemaId } });
    const filePath = this.filePathFor(schemaId);

    if (!entity) {
      // Brand-new sandbox — make sure there's no stale local file first.
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* file didn't exist — fine */
      }
      const handle = this.openHandle(schemaId, filePath);
      const report = provisionSandbox(handle.db, model);
      await this.persistToS3(
        schemaId,
        projectId,
        filePath,
        currentModel,
        currentHash,
      );
      return { db: handle.db, syncReport: report };
    }

    let handle = this.handles.get(schemaId);
    if (!handle) {
      const buffer = await this.s3Service.getObjectBuffer(entity.s3Key);
      if (buffer) {
        fs.writeFileSync(filePath, buffer);
      }
      handle = this.openHandle(schemaId, filePath);
    }
    handle.lastUsed = Date.now();

    if (entity.builtFromModelHash === currentHash) {
      return { db: handle.db };
    }

    // Schema drifted since the sandbox was last built — sync table by table.
    const oldModel = (await this.s3Service.getJsonObject<
      Record<string, unknown>
    >(entity.modelSnapshotS3Key)) ?? { tables: [] };
    const report = syncSandbox(
      handle.db,
      oldModel as unknown as PhysicalModelPayload,
      model,
    );
    await this.persistToS3(
      schemaId,
      projectId,
      filePath,
      currentModel,
      currentHash,
    );
    return { db: handle.db, syncReport: report };
  }

  /**
   * Read-only status check — does NOT provision a sandbox or open a DB
   * handle. Used by the frontend to show whether a sandbox already exists
   * and whether it's in sync with the current model, without the side
   * effects of `executeSandboxQuery`.
   */
  async getSandboxStatus(
    userId: string,
    projectId: string,
    schemaId: string,
  ): Promise<SandboxStatus> {
    await this.projectsService.getSchema(userId, projectId, schemaId);

    const entity = await this.sandboxRepo.findOne({ where: { schemaId } });
    if (!entity) {
      return { exists: false, inSync: true, lastUsedAt: null, createdAt: null };
    }

    const currentModel = await this.projectsService.getCurrentSchemaModel(
      projectId,
      schemaId,
    );
    const inSync = currentModel
      ? hashModel(currentModel) === entity.builtFromModelHash
      : true;

    return {
      exists: true,
      inSync,
      lastUsedAt: entity.lastUsedAt,
      createdAt: entity.createdAt,
    };
  }

  async executeSandboxQuery(
    userId: string,
    projectId: string,
    schemaId: string,
    query: string,
    resultLimit = 500,
  ): Promise<SandboxQueryResult> {
    await this.projectsService.checkWritePermission(userId, projectId);
    await this.projectsService.getSchema(userId, projectId, schemaId);

    const { db, syncReport } = await this.ensureSyncedSandbox(
      projectId,
      schemaId,
    );

    const start = Date.now();
    const trimmed = query.trim().replace(/;\s*$/, '');
    const isSelect = /^(select|with)\b/i.test(trimmed);

    try {
      if (isSelect) {
        const hasLimit = /\blimit\b/i.test(trimmed);
        const finalQuery = hasLimit
          ? trimmed
          : `${trimmed} LIMIT ${resultLimit}`;
        const stmt = db.prepare(finalQuery);
        const rows = stmt.all() as Record<string, unknown>[];
        const columns = stmt.columns().map((c) => c.name);
        return {
          success: true,
          rowCount: rows.length,
          columns,
          rows,
          executionTimeMs: Date.now() - start,
          syncReport,
        };
      }

      // Non-SELECT: may be a single statement (text_to_sql) or a batch of
      // INSERTs (seed_data) — better-sqlite3's exec() runs either. rowCount
      // reflects only the LAST statement's affected-row count when multiple
      // statements run in one call — a known best-effort limitation.
      //
      // Wrapped in db.transaction() so a batch either fully commits or fully
      // rolls back. Without this, SQLite's autocommit mode persists every
      // statement before the one that fails, leaving the sandbox partially
      // seeded — which then makes a retry of the same script fail differently
      // (stale rows collide with fresh inserts). better-sqlite3's transaction()
      // also falls back to a SAVEPOINT instead of BEGIN if a transaction is
      // already open on this handle, so it's safe even if ever called nested.
      db.transaction(() => db.exec(trimmed))();
      const { changes } = db.prepare('SELECT changes() AS changes').get() as {
        changes: number;
      };
      const modelForFlush = await this.projectsService.getCurrentSchemaModel(
        projectId,
        schemaId,
      );
      if (modelForFlush) {
        this.persistToS3(
          schemaId,
          projectId,
          this.filePathFor(schemaId),
          modelForFlush,
          hashModel(modelForFlush),
        ).catch((err) =>
          this.logger.warn(`Failed to persist sandbox after write: ${err}`),
        );
      }

      return {
        success: true,
        rowCount: changes,
        columns: [],
        rows: [],
        executionTimeMs: Date.now() - start,
        syncReport,
      };
    } catch (err) {
      return {
        success: false,
        rowCount: 0,
        columns: [],
        rows: [],
        executionTimeMs: Date.now() - start,
        message: err instanceof Error ? err.message : String(err),
        syncReport,
      };
    }
  }

  async resetSandbox(
    userId: string,
    projectId: string,
    schemaId: string,
  ): Promise<{ success: boolean; syncReport: SyncReportEntry[] }> {
    await this.projectsService.checkWritePermission(userId, projectId);
    await this.projectsService.getSchema(userId, projectId, schemaId);

    const currentModel = await this.projectsService.getCurrentSchemaModel(
      projectId,
      schemaId,
    );
    if (!currentModel) {
      throw new BadRequestException(
        'No physical schema model found for this schema — save your diagram first.',
      );
    }

    const existing = this.handles.get(schemaId);
    if (existing) {
      try {
        existing.db.close();
      } catch {
        /* ignore */
      }
      this.handles.delete(schemaId);
    }

    const filePath = this.filePathFor(schemaId);
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* fine if it didn't exist */
    }

    const handle = this.openHandle(schemaId, filePath);
    const model = currentModel as unknown as PhysicalModelPayload;
    const report = provisionSandbox(handle.db, model);
    await this.persistToS3(
      schemaId,
      projectId,
      filePath,
      currentModel,
      hashModel(currentModel),
    );

    return { success: true, syncReport: report };
  }
}
