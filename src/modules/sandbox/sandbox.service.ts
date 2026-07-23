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
  /** Present only when a multi-statement batch (seed data or an ad-hoc
   * multi-statement query) failed partway through — tells the caller exactly
   * how far it got instead of one opaque error for the whole batch. */
  statementProgress?: {
    total: number;
    succeeded: number;
    failedStatement: string;
  };
}

/** Splits a `;`-separated SQL string into individual statements, respecting
 * single/double-quoted literals (including `''`-escaped quotes) so a
 * semicolon inside a string value (e.g. a description field) doesn't cause a
 * false split. Good enough for SQLite's quoting rules — this sandbox is
 * always SQLite regardless of the project's target DBMS. */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    current += ch;

    if (ch === "'" && !inDoubleQuote) {
      if (inSingleQuote && sql[i + 1] === "'") {
        current += "'";
        i++;
      } else {
        inSingleQuote = !inSingleQuote;
      }
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.slice(0, -1).trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    }
  }

  const rest = current.trim();
  if (rest) statements.push(rest);
  return statements;
}

/** Thrown mid-transaction by a failing statement in a multi-statement batch —
 * carries enough context (index, total, the statement itself) for the caller
 * to report exactly where execution stopped, while still letting the
 * transaction wrapper roll back everything as a single atomic unit. */
class SandboxStatementError extends Error {
  constructor(
    message: string,
    readonly succeeded: number,
    readonly total: number,
    readonly statementText: string,
  ) {
    super(message);
  }
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
      // INSERTs (seed_data). Executed one statement at a time — still inside
      // a single db.transaction() so the whole batch is still all-or-nothing
      // (without this, SQLite's autocommit mode would persist every statement
      // before the one that fails, leaving the sandbox partially seeded —
      // which then makes a retry of the same script fail differently, as
      // stale rows collide with fresh inserts) — but a failure partway
      // through now reports exactly which statement it choked on, and how
      // many ran successfully before it, instead of one opaque error for the
      // entire batch. better-sqlite3's transaction() also falls back to a
      // SAVEPOINT instead of BEGIN if a transaction is already open on this
      // handle, so it's safe even if ever called nested.
      const individualStatements = splitSqlStatements(trimmed);
      let totalChanges = 0;
      db.transaction(() => {
        let succeeded = 0;
        for (const statement of individualStatements) {
          try {
            db.exec(statement);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new SandboxStatementError(
              message,
              succeeded,
              individualStatements.length,
              statement,
            );
          }
          const { changes } = db
            .prepare('SELECT changes() AS changes')
            .get() as {
            changes: number;
          };
          totalChanges += changes;
          succeeded++;
        }
      })();
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
        rowCount: totalChanges,
        columns: [],
        rows: [],
        executionTimeMs: Date.now() - start,
        syncReport,
      };
    } catch (err) {
      if (err instanceof SandboxStatementError) {
        return {
          success: false,
          rowCount: 0,
          columns: [],
          rows: [],
          executionTimeMs: Date.now() - start,
          message: `Statement ${err.succeeded + 1}/${err.total} failed: ${err.message}`,
          syncReport,
          statementProgress: {
            total: err.total,
            succeeded: err.succeeded,
            failedStatement: err.statementText,
          },
        };
      }
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
