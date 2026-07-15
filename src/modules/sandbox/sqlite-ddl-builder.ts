/**
 * Builds SQLite DDL from a physical schema model.json. Best-effort by
 * design — this powers a prototyping sandbox, not a production migration
 * tool, so dialect fidelity to the schema's configured target DBMS
 * (postgresql/mysql/sqlserver) is intentionally not attempted.
 */

import {
  PhysicalModelPayload,
  SandboxColumn,
  SandboxTable,
} from './sandbox.types';

const TYPE_MAP: Record<string, string> = {
  varchar: 'TEXT',
  char: 'TEXT',
  text: 'TEXT',
  nvarchar: 'TEXT',
  nchar: 'TEXT',
  ntext: 'TEXT',
  uuid: 'TEXT',
  uniqueidentifier: 'TEXT',
  json: 'TEXT',
  jsonb: 'TEXT',
  enum: 'TEXT',
  integer: 'INTEGER',
  int: 'INTEGER',
  bigint: 'INTEGER',
  smallint: 'INTEGER',
  tinyint: 'INTEGER',
  serial: 'INTEGER',
  bigserial: 'INTEGER',
  smallserial: 'INTEGER',
  decimal: 'REAL',
  numeric: 'REAL',
  float: 'REAL',
  double: 'REAL',
  real: 'REAL',
  money: 'REAL',
  boolean: 'INTEGER',
  bit: 'INTEGER',
  date: 'TEXT',
  time: 'TEXT',
  timestamp: 'TEXT',
  timestamptz: 'TEXT',
  datetime: 'TEXT',
  datetime2: 'TEXT',
};

export function mapSqliteType(dataType: string | undefined): string {
  if (!dataType) return 'TEXT';
  return TYPE_MAP[dataType.toLowerCase()] ?? 'TEXT';
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function formatDefault(raw: string): string {
  const trimmed = raw.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'true' ? '1' : '0';
  }
  if (
    /^(now\(\)|current_timestamp|getdate\(\)|sysdate|current_date)$/i.test(
      trimmed,
    )
  ) {
    return 'CURRENT_TIMESTAMP';
  }
  const unquoted = trimmed.replace(/^'(.*)'$/, '$1');
  return `'${unquoted.replace(/'/g, "''")}'`;
}

/** Topological sort so referenced (parent) tables are created before dependents. Falls back to leaving unresolved tables in original order on cycles. */
export function topoSortTables(tables: SandboxTable[]): SandboxTable[] {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: SandboxTable[] = [];

  function visit(table: SandboxTable): void {
    if (visited.has(table.id) || visiting.has(table.id)) return;
    visiting.add(table.id);
    for (const col of table.columns) {
      const refId = col.roles?.foreignKey?.refTableId;
      if (refId && refId !== table.id) {
        const refTable = byId.get(refId);
        if (refTable) visit(refTable);
      }
    }
    visiting.delete(table.id);
    visited.add(table.id);
    result.push(table);
  }

  for (const t of tables) visit(t);
  for (const t of tables) if (!visited.has(t.id)) result.push(t);
  return result;
}

function buildLookups(model: PhysicalModelPayload) {
  const tableNameById = new Map<string, string>();
  const columnNameById = new Map<string, string>();
  for (const t of model.tables ?? []) {
    tableNameById.set(t.id, t.name);
    for (const c of t.columns) columnNameById.set(`${t.id}:${c.id}`, c.name);
  }
  return { tableNameById, columnNameById };
}

/** Build the CREATE TABLE statement for a single table, resolving FK targets against the full model (the referenced table may be elsewhere in the model). */
export function buildTableSql(
  table: SandboxTable,
  model: PhysicalModelPayload,
): string {
  const { tableNameById, columnNameById } = buildLookups(model);

  const pkCols = table.columns.filter((c) => c.roles?.primaryKey);
  const singleIntAutoPk: SandboxColumn | null =
    pkCols.length === 1 &&
    pkCols[0].autoIncrement &&
    mapSqliteType(pkCols[0].dataType) === 'INTEGER'
      ? pkCols[0]
      : null;

  const columnDefs: string[] = [];
  const fkDefs: string[] = [];

  for (const col of table.columns) {
    const sqlType = mapSqliteType(col.dataType);
    const parts = [quoteIdent(col.name), sqlType];

    if (singleIntAutoPk && col.id === singleIntAutoPk.id) {
      parts.push('PRIMARY KEY AUTOINCREMENT');
    } else {
      if (!col.nullable) parts.push('NOT NULL');
      if (col.unique) parts.push('UNIQUE');
    }

    if (col.defaultValue) {
      parts.push(`DEFAULT ${formatDefault(col.defaultValue)}`);
    }

    columnDefs.push(parts.join(' '));

    const fk = col.roles?.foreignKey;
    if (fk) {
      const refTableName = tableNameById.get(fk.refTableId);
      const refColName = columnNameById.get(
        `${fk.refTableId}:${fk.refColumnId}`,
      );
      if (refTableName && refColName) {
        const onDelete = fk.onDelete?.trim() || 'NO ACTION';
        const onUpdate = fk.onUpdate?.trim() || 'NO ACTION';
        fkDefs.push(
          `FOREIGN KEY (${quoteIdent(col.name)}) REFERENCES ${quoteIdent(
            refTableName,
          )}(${quoteIdent(refColName)}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`,
        );
      }
    }
  }

  if (!singleIntAutoPk && pkCols.length > 0) {
    columnDefs.push(
      `PRIMARY KEY (${pkCols.map((c) => quoteIdent(c.name)).join(', ')})`,
    );
  }

  const body = [...columnDefs, ...fkDefs].join(',\n  ');
  return `CREATE TABLE ${quoteIdent(table.name)} (\n  ${body}\n)`;
}

export function buildIndexStatements(table: SandboxTable): string[] {
  return (table.indexes ?? []).map((idx) => {
    const cols = idx.columns
      .map(
        (c) =>
          `${quoteIdent(c.columnName)}${c.order === 'DESC' ? ' DESC' : ''}`,
      )
      .join(', ');
    const uniqueKw = idx.isUnique ? 'UNIQUE ' : '';
    const idxName = quoteIdent(`${table.name}_${idx.name}`);
    return `CREATE ${uniqueKw}INDEX IF NOT EXISTS ${idxName} ON ${quoteIdent(table.name)} (${cols})`;
  });
}

/** Full DDL for a brand-new sandbox — every table + index, in FK-safe order. */
export function buildFullDDL(model: PhysicalModelPayload): string[] {
  const ordered = topoSortTables(model.tables ?? []);
  const statements: string[] = [];
  for (const table of ordered) {
    statements.push(buildTableSql(table, model));
    statements.push(...buildIndexStatements(table));
  }
  return statements;
}
