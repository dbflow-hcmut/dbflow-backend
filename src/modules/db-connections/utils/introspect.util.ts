import { Client as PgClient } from 'pg';
import { DbConnectionDbms } from '@/common/enums/db-connection.enum';

// ─── Raw row types for pg query results ──────────────────────────────
interface PgSchemaRow {
  schema_name: string;
}
interface PgTableRow {
  table_name: string;
}
interface PgKeyRow {
  column_name: string;
}
interface PgColumnRow {
  column_name: string;
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
  is_identity: string;
}
interface PgFKRow {
  constraint_name: string;
  column_name: string;
  ref_table: string;
  ref_column: string;
  delete_rule: string;
  update_rule: string;
}
interface PgIndexRow {
  index_name: string;
  column_name: string;
  index_type: string;
  is_unique: boolean;
  sort_order: string;
}

// ─── Types ──────────────────────────────────────────────────────────

export interface IntrospectedColumn {
  name: string;
  dataType: string;
  length?: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
}

export interface IntrospectedForeignKey {
  constraintName: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
  onUpdate: string;
}

export interface IntrospectedIndex {
  name: string;
  columns: { columnName: string; order: 'ASC' | 'DESC' }[];
  isUnique: boolean;
  type: string;
}

export interface IntrospectedTable {
  name: string;
  columns: IntrospectedColumn[];
  foreignKeys: IntrospectedForeignKey[];
  indexes: IntrospectedIndex[];
}

export interface IntrospectParams {
  dbms: DbConnectionDbms;
  host: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  /** Schema/namespace to introspect (default: 'public' for PG, database name for MySQL) */
  schema?: string;
}

// ─── List schemas dispatcher ────────────────────────────────────────

export async function listSchemas(
  params: Omit<IntrospectParams, 'schema'>,
): Promise<string[]> {
  switch (params.dbms) {
    case DbConnectionDbms.PostgreSQL:
      return listSchemasPostgres(params);
    case DbConnectionDbms.MySQL:
      return listSchemasMySQL(params);
    default:
      return [];
  }
}

// ─── Introspect dispatcher ──────────────────────────────────────────

export async function introspectSchema(
  params: IntrospectParams,
): Promise<IntrospectedTable[]> {
  switch (params.dbms) {
    case DbConnectionDbms.PostgreSQL:
      return introspectPostgres(params);
    case DbConnectionDbms.MySQL:
      return introspectMySQL(params);
    default:
      throw new Error(`Introspect not supported for ${params.dbms}`);
  }
}

// ─── PostgreSQL: list schemas ────────────────────────────────────────

async function listSchemasPostgres(
  params: Omit<IntrospectParams, 'schema'>,
): Promise<string[]> {
  const client = new PgClient({
    host: params.host,
    port: params.port ?? 5432,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const res = await client.query<PgSchemaRow>(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        AND schema_name NOT LIKE 'pg_temp_%'
        AND schema_name NOT LIKE 'pg_toast_temp_%'
      ORDER BY schema_name
    `);
    return res.rows.map((r) => r.schema_name);
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── MySQL: list schemas ─────────────────────────────────────────────

async function listSchemasMySQL(
  params: Omit<IntrospectParams, 'schema'>,
): Promise<string[]> {
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    host: params.host,
    port: params.port ?? 3306,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? {} : undefined,
    connectTimeout: 10000,
  });
  try {
    const [rows] = await connection.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
       ORDER BY schema_name`,
    );
    return (rows as Array<Record<string, string>>).map(
      (r) => r.SCHEMA_NAME ?? r.schema_name,
    );
  } finally {
    await connection.end().catch(() => {});
  }
}

// ─── PostgreSQL ─────────────────────────────────────────────────────

async function introspectPostgres(
  params: IntrospectParams,
): Promise<IntrospectedTable[]> {
  const client = new PgClient({
    host: params.host,
    port: params.port ?? 5432,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();

    const schemaName = params.schema ?? 'public';

    // 1. Get all tables
    const tablesRes = await client.query<PgTableRow>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schemaName],
    );

    const tables: IntrospectedTable[] = [];

    for (const row of tablesRes.rows) {
      const tableName: string = row.table_name;

      // 2. Columns
      const colsRes = await client.query<PgColumnRow>(
        `
        SELECT
          c.column_name,
          c.data_type,
          c.udt_name,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale,
          c.is_nullable,
          c.column_default,
          c.is_identity,
          c.identity_generation
        FROM information_schema.columns c
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
      `,
        [schemaName, tableName],
      );

      // 3. Primary keys
      const pkRes = await client.query<PgKeyRow>(
        `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1
          AND tc.table_name = $2
          AND tc.constraint_type = 'PRIMARY KEY'
      `,
        [schemaName, tableName],
      );
      const pkColumns = new Set(pkRes.rows.map((r) => r.column_name));

      // 4. Unique constraints (column-level)
      const uniqueRes = await client.query<PgKeyRow>(
        `
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = $1
          AND tc.table_name = $2
          AND tc.constraint_type = 'UNIQUE'
      `,
        [schemaName, tableName],
      );
      const uniqueColumns = new Set(uniqueRes.rows.map((r) => r.column_name));

      const columns: IntrospectedColumn[] = colsRes.rows.map((col) => {
        const dataType = mapPgType(col.udt_name, col.data_type);
        const length = buildPgLength(col);
        const isSerial =
          col.column_default !== null &&
          col.column_default.startsWith('nextval(');
        const isIdentity = col.is_identity === 'YES';

        return {
          name: col.column_name,
          dataType,
          length: length || undefined,
          nullable: col.is_nullable === 'YES',
          isPrimaryKey: pkColumns.has(col.column_name),
          isUnique: uniqueColumns.has(col.column_name),
          autoIncrement: isSerial || isIdentity,
          defaultValue:
            col.column_default !== null && !isSerial && !isIdentity
              ? col.column_default
              : undefined,
        };
      });

      // 5. Foreign keys
      const fkRes = await client.query<PgFKRow>(
        `
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS ref_table,
          ccu.column_name AS ref_column,
          rc.delete_rule,
          rc.update_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
          AND tc.table_schema = rc.constraint_schema
        WHERE tc.table_schema = $1
          AND tc.table_name = $2
          AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.constraint_name, kcu.ordinal_position
      `,
        [schemaName, tableName],
      );

      const fkMap = new Map<string, IntrospectedForeignKey>();
      for (const fk of fkRes.rows) {
        const name = fk.constraint_name;
        if (!fkMap.has(name)) {
          fkMap.set(name, {
            constraintName: name,
            columns: [],
            refTable: fk.ref_table,
            refColumns: [],
            onDelete: fk.delete_rule,
            onUpdate: fk.update_rule,
          });
        }
        const entry = fkMap.get(name)!;
        entry.columns.push(fk.column_name);
        entry.refColumns.push(fk.ref_column);
      }

      // 6. Indexes (non-PK, non-unique-constraint)
      const idxRes = await client.query<PgIndexRow>(
        `
        SELECT
          i.relname AS index_name,
          a.attname AS column_name,
          am.amname AS index_type,
          ix.indisunique AS is_unique,
          CASE WHEN ix.indoption[array_position(ix.indkey, a.attnum) - 1] & 1 = 1
               THEN 'DESC' ELSE 'ASC' END AS sort_order
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_am am ON am.oid = i.relam
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        JOIN pg_namespace ns ON ns.oid = t.relnamespace
        WHERE ns.nspname = $1
          AND t.relname = $2
          AND NOT ix.indisprimary
        ORDER BY i.relname, array_position(ix.indkey, a.attnum)
      `,
        [schemaName, tableName],
      );

      const idxMap = new Map<string, IntrospectedIndex>();
      for (const idx of idxRes.rows) {
        const name = idx.index_name;
        if (!idxMap.has(name)) {
          idxMap.set(name, {
            name,
            columns: [],
            isUnique: idx.is_unique,
            type: idx.index_type.toUpperCase(),
          });
        }
        idxMap.get(name)!.columns.push({
          columnName: idx.column_name,
          order: idx.sort_order === 'DESC' ? 'DESC' : 'ASC',
        });
      }

      tables.push({
        name: tableName,
        columns,
        foreignKeys: Array.from(fkMap.values()),
        indexes: Array.from(idxMap.values()),
      });
    }

    return tables;
  } finally {
    await client.end().catch(() => {});
  }
}

function mapPgType(udtName: string, dataType: string): string {
  const map: Record<string, string> = {
    int2: 'SMALLINT',
    int4: 'INTEGER',
    int8: 'BIGINT',
    float4: 'REAL',
    float8: 'DOUBLE PRECISION',
    numeric: 'NUMERIC',
    bool: 'BOOLEAN',
    varchar: 'VARCHAR',
    bpchar: 'CHAR',
    text: 'TEXT',
    date: 'DATE',
    time: 'TIME',
    timetz: 'TIME WITH TIME ZONE',
    timestamp: 'TIMESTAMP',
    timestamptz: 'TIMESTAMP WITH TIME ZONE',
    uuid: 'UUID',
    json: 'JSON',
    jsonb: 'JSONB',
    bytea: 'BYTEA',
    inet: 'INET',
    cidr: 'CIDR',
    macaddr: 'MACADDR',
    xml: 'XML',
    money: 'MONEY',
    interval: 'INTERVAL',
    point: 'POINT',
    line: 'LINE',
    polygon: 'POLYGON',
    circle: 'CIRCLE',
    tsvector: 'TSVECTOR',
    tsquery: 'TSQUERY',
  };
  return map[udtName] ?? dataType.toUpperCase();
}

function buildPgLength(col: PgColumnRow): string | undefined {
  if (col.character_maximum_length !== null) {
    return String(col.character_maximum_length);
  }
  if (col.numeric_precision !== null && col.numeric_scale !== null) {
    return `${col.numeric_precision},${col.numeric_scale}`;
  }
  return undefined;
}

// ─── MySQL ──────────────────────────────────────────────────────────

async function introspectMySQL(
  params: IntrospectParams,
): Promise<IntrospectedTable[]> {
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    host: params.host,
    port: params.port ?? 3306,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? {} : undefined,
    connectTimeout: 10000,
  });

  try {
    const db = params.database;

    // 1. Tables
    const [tablesRows] = await connection.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [db],
    );

    const tables: IntrospectedTable[] = [];

    for (const tRow of tablesRows as Array<Record<string, string>>) {
      const tableName = tRow.TABLE_NAME ?? tRow.table_name;

      // 2. Columns
      const [colRows] = await connection.query(
        `SELECT
           column_name, data_type, column_type,
           character_maximum_length, numeric_precision, numeric_scale,
           is_nullable, column_default, column_key, extra
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position`,
        [db, tableName],
      );

      const columns: IntrospectedColumn[] = (
        colRows as Array<Record<string, unknown>>
      ).map((col) => {
        const colName =
          (col.COLUMN_NAME as string) ?? (col.column_name as string);
        const colKey = (col.COLUMN_KEY as string) ?? (col.column_key as string);
        const extra = (col.EXTRA as string) ?? (col.extra as string) ?? '';
        const rawType =
          (col.DATA_TYPE as string) ?? (col.data_type as string) ?? '';

        let length: string | undefined;
        const charMax = (col.CHARACTER_MAXIMUM_LENGTH ??
          col.character_maximum_length) as number | null | undefined;
        const numPrec = (col.NUMERIC_PRECISION ?? col.numeric_precision) as
          | number
          | null
          | undefined;
        const numScale = (col.NUMERIC_SCALE ?? col.numeric_scale) as
          | number
          | null
          | undefined;
        if (charMax != null) length = String(charMax);
        else if (numPrec != null && numScale != null)
          length = `${numPrec},${numScale}`;

        return {
          name: colName,
          dataType: rawType.toUpperCase(),
          length: length || undefined,
          nullable:
            ((col.IS_NULLABLE as string) ?? (col.is_nullable as string)) ===
            'YES',
          isPrimaryKey: colKey === 'PRI',
          isUnique: colKey === 'UNI',
          autoIncrement: extra.toLowerCase().includes('auto_increment'),
          defaultValue:
            (col.COLUMN_DEFAULT ?? col.column_default)
              ? String(col.COLUMN_DEFAULT ?? col.column_default)
              : undefined,
        };
      });

      // 3. Foreign keys
      const [fkRows] = await connection.query(
        `SELECT
           kcu.constraint_name,
           kcu.column_name,
           kcu.referenced_table_name,
           kcu.referenced_column_name,
           rc.delete_rule,
           rc.update_rule
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON kcu.constraint_name = rc.constraint_name
           AND kcu.table_schema = rc.constraint_schema
         WHERE kcu.table_schema = ?
           AND kcu.table_name = ?
           AND kcu.referenced_table_name IS NOT NULL
         ORDER BY kcu.constraint_name, kcu.ordinal_position`,
        [db, tableName],
      );

      const fkMap = new Map<string, IntrospectedForeignKey>();
      for (const fk of fkRows as Array<Record<string, string>>) {
        const name = fk.CONSTRAINT_NAME ?? fk.constraint_name;
        if (!fkMap.has(name)) {
          fkMap.set(name, {
            constraintName: name,
            columns: [],
            refTable: fk.REFERENCED_TABLE_NAME ?? fk.referenced_table_name,
            refColumns: [],
            onDelete: fk.DELETE_RULE ?? fk.delete_rule,
            onUpdate: fk.UPDATE_RULE ?? fk.update_rule,
          });
        }
        const entry = fkMap.get(name)!;
        entry.columns.push(fk.COLUMN_NAME ?? fk.column_name);
        entry.refColumns.push(
          fk.REFERENCED_COLUMN_NAME ?? fk.referenced_column_name,
        );
      }

      // 4. Indexes
      const [idxRows] = await connection.query(
        `SELECT
           index_name, column_name, non_unique, index_type,
           CASE WHEN collation = 'D' THEN 'DESC' ELSE 'ASC' END AS sort_order
         FROM information_schema.statistics
         WHERE table_schema = ? AND table_name = ?
           AND index_name != 'PRIMARY'
         ORDER BY index_name, seq_in_index`,
        [db, tableName],
      );

      const idxMap = new Map<string, IntrospectedIndex>();
      for (const idx of idxRows as Array<Record<string, unknown>>) {
        const name = (idx.INDEX_NAME as string) ?? (idx.index_name as string);
        if (!idxMap.has(name)) {
          idxMap.set(name, {
            name,
            columns: [],
            isUnique: ((idx.NON_UNIQUE ?? idx.non_unique) as number) === 0,
            type:
              (
                (idx.INDEX_TYPE as string) ?? (idx.index_type as string)
              )?.toUpperCase() ?? 'BTREE',
          });
        }
        idxMap.get(name)!.columns.push({
          columnName:
            (idx.COLUMN_NAME as string) ?? (idx.column_name as string),
          order:
            ((idx.sort_order as string) ?? 'ASC') === 'DESC' ? 'DESC' : 'ASC',
        });
      }

      tables.push({
        name: tableName,
        columns,
        foreignKeys: Array.from(fkMap.values()),
        indexes: Array.from(idxMap.values()),
      });
    }

    return tables;
  } finally {
    await connection.end().catch(() => {});
  }
}
