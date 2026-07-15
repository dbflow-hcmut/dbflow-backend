/**
 * Schema-drift sync algorithm — brings an existing sandbox sqlite file in
 * line with the schema's current physical model.json, table by table.
 *
 * Unchanged tables are left completely untouched (zero risk to their data).
 * Changed tables are rebuilt via the standard SQLite "copy into a new table,
 * drop the old one, rename" pattern (SQLite's ALTER TABLE can't add/drop
 * constraints or change a column's type in place). If a rebuild fails for a
 * given table (e.g. a new NOT NULL column with no default that old rows
 * can't satisfy), only THAT table falls back to being wiped and recreated
 * empty — the rest of the sandbox is unaffected.
 *
 * Exported as plain functions (no NestJS DI) so it can be unit-tested
 * directly against a real `:memory:` better-sqlite3 database.
 */

import type { Database } from 'better-sqlite3';
import {
  buildFullDDL,
  buildIndexStatements,
  buildTableSql,
  quoteIdent,
} from './sqlite-ddl-builder';
import {
  PhysicalModelPayload,
  SandboxColumn,
  SandboxTable,
  SyncReportEntry,
} from './sandbox.types';

function normalizeColumn(col: SandboxColumn) {
  return {
    name: col.name,
    dataType: (col.dataType ?? '').toLowerCase(),
    length: col.length ?? null,
    nullable: col.nullable,
    unique: col.unique,
    autoIncrement: !!col.autoIncrement,
    defaultValue: col.defaultValue ?? null,
    primaryKey: !!col.roles?.primaryKey,
    foreignKey: col.roles?.foreignKey
      ? {
          refTableId: col.roles.foreignKey.refTableId,
          refColumnId: col.roles.foreignKey.refColumnId,
          onDelete: col.roles.foreignKey.onDelete ?? null,
          onUpdate: col.roles.foreignKey.onUpdate ?? null,
        }
      : null,
  };
}

function normalizeTable(table: SandboxTable) {
  return {
    name: table.name,
    columns: table.columns.map(normalizeColumn),
    indexes: (table.indexes ?? []).map((idx) => ({
      name: idx.name,
      isUnique: idx.isUnique,
      columns: idx.columns.map((c) => ({
        columnName: c.columnName,
        order: c.order ?? 'ASC',
      })),
    })),
  };
}

/** Structural equality, ignoring `id` fields — only shape matters here. */
export function tablesAreIdentical(a: SandboxTable, b: SandboxTable): boolean {
  return (
    JSON.stringify(normalizeTable(a)) === JSON.stringify(normalizeTable(b))
  );
}

function rebuildTable(
  db: Database,
  oldTable: SandboxTable,
  newTable: SandboxTable,
  model: PhysicalModelPayload,
): SyncReportEntry {
  const tmpName = `__rebuild_${newTable.name}_${Date.now()}`;
  const tmpTable: SandboxTable = { ...newTable, name: tmpName };

  try {
    db.exec('SAVEPOINT sandbox_rebuild');
    db.exec(buildTableSql(tmpTable, model));

    const oldColNames = new Set(oldTable.columns.map((c) => c.name));
    const carryOverCols = newTable.columns
      .map((c) => c.name)
      .filter((name) => oldColNames.has(name));

    if (carryOverCols.length > 0) {
      const colList = carryOverCols.map(quoteIdent).join(', ');
      db.exec(
        `INSERT INTO ${quoteIdent(tmpName)} (${colList}) SELECT ${colList} FROM ${quoteIdent(oldTable.name)}`,
      );
    }

    db.exec(`DROP TABLE ${quoteIdent(oldTable.name)}`);
    db.exec(
      `ALTER TABLE ${quoteIdent(tmpName)} RENAME TO ${quoteIdent(newTable.name)}`,
    );
    for (const idxSql of buildIndexStatements(newTable)) db.exec(idxSql);
    db.exec('RELEASE sandbox_rebuild');

    return { table: newTable.name, action: 'migrated' };
  } catch (err) {
    // Roll back the failed rebuild attempt, then fall back to wiping just
    // this one table so the rest of the sandbox is unaffected.
    try {
      db.exec('ROLLBACK TO sandbox_rebuild');
      db.exec('RELEASE sandbox_rebuild');
    } catch {
      /* savepoint may already be gone — ignore */
    }
    db.exec(`DROP TABLE IF EXISTS ${quoteIdent(tmpName)}`);
    db.exec(`DROP TABLE IF EXISTS ${quoteIdent(newTable.name)}`);

    const reason = err instanceof Error ? err.message : String(err);

    // The recreate-empty fallback itself can fail if `newTable` is
    // structurally invalid (e.g. a duplicate column name from a corrupt
    // model.json) — never let that escape uncaught and abort the whole
    // sync. Worst case, the table is simply left absent.
    try {
      db.exec(buildTableSql(newTable, model));
      for (const idxSql of buildIndexStatements(newTable)) db.exec(idxSql);
    } catch (recreateErr) {
      return {
        table: newTable.name,
        action: 'reset',
        reason: `${reason}; recreate also failed: ${recreateErr instanceof Error ? recreateErr.message : String(recreateErr)}`,
      };
    }

    return { table: newTable.name, action: 'reset', reason };
  }
}

/**
 * Provision a brand-new sandbox from scratch (no prior model to diff against).
 */
export function provisionSandbox(
  db: Database,
  model: PhysicalModelPayload,
): SyncReportEntry[] {
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const stmt of buildFullDDL(model)) db.exec(stmt);
  db.exec('PRAGMA foreign_keys = ON;');
  return (model.tables ?? []).map((t) => ({
    table: t.name,
    action: 'created' as const,
  }));
}

/**
 * Sync an existing sandbox to match `newModel`, given the model it was
 * previously built from (`oldModel`). Returns a per-table report.
 */
export function syncSandbox(
  db: Database,
  oldModel: PhysicalModelPayload,
  newModel: PhysicalModelPayload,
): SyncReportEntry[] {
  db.exec('PRAGMA foreign_keys = OFF;');

  const report: SyncReportEntry[] = [];
  const oldTables = new Map((oldModel.tables ?? []).map((t) => [t.id, t]));
  const newTables = new Map((newModel.tables ?? []).map((t) => [t.id, t]));

  for (const [id, oldTable] of oldTables) {
    if (!newTables.has(id)) {
      db.exec(`DROP TABLE IF EXISTS ${quoteIdent(oldTable.name)}`);
      report.push({ table: oldTable.name, action: 'dropped' });
    }
  }

  for (const [id, newTable] of newTables) {
    const oldTable = oldTables.get(id);

    if (!oldTable) {
      db.exec(buildTableSql(newTable, newModel));
      for (const idxSql of buildIndexStatements(newTable)) db.exec(idxSql);
      report.push({ table: newTable.name, action: 'created' });
      continue;
    }

    if (tablesAreIdentical(oldTable, newTable)) {
      report.push({ table: newTable.name, action: 'unchanged' });
      continue;
    }

    report.push(rebuildTable(db, oldTable, newTable, newModel));
  }

  db.exec('PRAGMA foreign_keys = ON;');
  return report;
}
