/**
 * Builds SQLite DDL from a physical schema model.json. Best-effort by
 * design — this powers a prototyping sandbox, not a production migration
 * tool, so dialect fidelity to the schema's configured target DBMS
 * (postgresql/mysql/sqlserver) is intentionally not attempted.
 */

import {
  PhysicalModelPayload,
  SandboxColumn,
  SandboxForeignKey,
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

interface ForeignKeyColumn {
  column: SandboxColumn;
  foreignKey: SandboxForeignKey;
}

function formatForeignKeyDefinition(
  sourceColumns: SandboxColumn[],
  targetTable: SandboxTable,
  targetColumns: SandboxColumn[],
  foreignKeys: SandboxForeignKey[],
): string {
  const first = foreignKeys[0];
  const onDelete =
    foreignKeys.find((fk) => fk.onDelete?.trim())?.onDelete?.trim() ||
    first.onDelete?.trim() ||
    'NO ACTION';
  const onUpdate =
    foreignKeys.find((fk) => fk.onUpdate?.trim())?.onUpdate?.trim() ||
    first.onUpdate?.trim() ||
    'NO ACTION';

  return `FOREIGN KEY (${sourceColumns.map((col) => quoteIdent(col.name)).join(', ')}) REFERENCES ${quoteIdent(
    targetTable.name,
  )}(${targetColumns.map((col) => quoteIdent(col.name)).join(', ')}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`;
}

/**
 * Column-level FK metadata represents a composite FK as several columns that
 * reference every column of the same target composite PK. Group those columns
 * into one SQLite table constraint. Repeated references to the same target
 * column start a separate group, preserving cases such as created_by and
 * updated_by both referencing users.id.
 */
function buildForeignKeyDefinitions(
  table: SandboxTable,
  model: PhysicalModelPayload,
): string[] {
  const tableById = new Map(
    (model.tables ?? []).map((item) => [item.id, item]),
  );
  const groupsByTarget = new Map<string, ForeignKeyColumn[][]>();

  for (const column of table.columns) {
    const foreignKey = column.roles?.foreignKey;
    if (!foreignKey || !tableById.has(foreignKey.refTableId)) continue;

    const groups = groupsByTarget.get(foreignKey.refTableId) ?? [];
    const group = groups.find(
      (candidate) =>
        !candidate.some(
          (entry) => entry.foreignKey.refColumnId === foreignKey.refColumnId,
        ),
    );
    const entry = { column, foreignKey };
    if (group) group.push(entry);
    else groups.push([entry]);
    groupsByTarget.set(foreignKey.refTableId, groups);
  }

  const definitions: string[] = [];
  for (const [targetTableId, groups] of groupsByTarget) {
    const targetTable = tableById.get(targetTableId);
    if (!targetTable) continue;
    const targetPrimaryKey = targetTable.columns.filter(
      (column) => column.roles?.primaryKey,
    );

    for (const group of groups) {
      const entryByTargetColumnId = new Map(
        group.map((entry) => [entry.foreignKey.refColumnId, entry]),
      );
      const isCompleteCompositeReference =
        targetPrimaryKey.length > 1 &&
        group.length === targetPrimaryKey.length &&
        targetPrimaryKey.every((column) =>
          entryByTargetColumnId.has(column.id),
        );

      if (isCompleteCompositeReference) {
        const orderedEntries = targetPrimaryKey.map(
          (column) => entryByTargetColumnId.get(column.id)!,
        );
        definitions.push(
          formatForeignKeyDefinition(
            orderedEntries.map((entry) => entry.column),
            targetTable,
            targetPrimaryKey,
            orderedEntries.map((entry) => entry.foreignKey),
          ),
        );
        continue;
      }

      for (const entry of group) {
        const targetColumn = targetTable.columns.find(
          (column) => column.id === entry.foreignKey.refColumnId,
        );
        if (!targetColumn) continue;
        definitions.push(
          formatForeignKeyDefinition(
            [entry.column],
            targetTable,
            [targetColumn],
            [entry.foreignKey],
          ),
        );
      }
    }
  }

  return definitions;
}

/** Build the CREATE TABLE statement for a single table, resolving FK targets against the full model (the referenced table may be elsewhere in the model). */
export function buildTableSql(
  table: SandboxTable,
  model: PhysicalModelPayload,
): string {
  const pkCols = table.columns.filter((c) => c.roles?.primaryKey);
  const singleIntAutoPk: SandboxColumn | null =
    pkCols.length === 1 &&
    pkCols[0].autoIncrement &&
    mapSqliteType(pkCols[0].dataType) === 'INTEGER'
      ? pkCols[0]
      : null;

  const columnDefs: string[] = [];

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
  }

  if (!singleIntAutoPk && pkCols.length > 0) {
    columnDefs.push(
      `PRIMARY KEY (${pkCols.map((c) => quoteIdent(c.name)).join(', ')})`,
    );
  }

  const fkDefs = buildForeignKeyDefinitions(table, model);
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
