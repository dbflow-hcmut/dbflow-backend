import { ConnectParams } from './db-connector.factory';
import { DbConnectionDbms } from '@/common/enums/db-connection.enum';
import { Client as PgClient } from 'pg';

export interface PermissionMatrix {
  can_create_table: boolean;
  can_drop_table: boolean;
  can_alter_table: boolean;
  can_create_index: boolean;
  can_drop_index: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_create_schema: boolean;
  is_superuser: boolean;
  missing_permissions: string[];
}

const ALL_TRUE: Omit<PermissionMatrix, 'missing_permissions'> = {
  can_create_table: true,
  can_drop_table: true,
  can_alter_table: true,
  can_create_index: true,
  can_drop_index: true,
  can_insert: true,
  can_update: true,
  can_delete: true,
  can_create_schema: true,
  is_superuser: true,
};

export async function checkPermissions(
  params: ConnectParams,
): Promise<PermissionMatrix> {
  switch (params.dbms) {
    case DbConnectionDbms.PostgreSQL:
      return checkPostgres(params);
    case DbConnectionDbms.MySQL:
      return checkMySQL(params);
    default:
      // SQL Server: not yet implemented — return all true so it doesn't block
      return { ...ALL_TRUE, is_superuser: false, missing_permissions: [] };
  }
}

// ── PostgreSQL ─────────────────────────────────────────────────────────

async function checkPostgres(params: ConnectParams): Promise<PermissionMatrix> {
  const DEFAULT_PORTS: Record<DbConnectionDbms, number> = {
    [DbConnectionDbms.PostgreSQL]: 5432,
    [DbConnectionDbms.MySQL]: 3306,
    [DbConnectionDbms.SQLServer]: 1433,
  };
  const port = params.port ?? DEFAULT_PORTS[DbConnectionDbms.PostgreSQL];

  const client = new PgClient({
    host: params.host,
    port,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  client.on('error', () => {});

  try {
    await client.connect();

    const { rows } = await client.query<{
      is_superuser: boolean;
      can_create_schema: boolean;
      can_create_table: boolean;
      has_create_on_current_schema: boolean;
    }>(`
      SELECT
        (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)      AS is_superuser,
        has_schema_privilege(current_schema(), 'CREATE')                  AS can_create_schema,
        has_schema_privilege(current_schema(), 'USAGE')                   AS can_create_table,
        has_schema_privilege(current_schema(), 'CREATE')                  AS has_create_on_current_schema
    `);

    const row = rows[0];
    const isSuperuser = row?.is_superuser ?? false;

    if (isSuperuser) {
      return { ...ALL_TRUE, missing_permissions: [] };
    }

    const canCreate = row?.can_create_schema ?? false;

    // Without superuser, DDL permissions (CREATE TABLE, DROP, ALTER, CREATE INDEX)
    // all require CREATE privilege on the schema.
    const matrix: PermissionMatrix = {
      is_superuser: false,
      can_create_schema: canCreate,
      can_create_table: canCreate,
      can_drop_table: canCreate,
      can_alter_table: canCreate,
      can_create_index: canCreate,
      can_drop_index: canCreate,
      // DML: check via has_table_privilege on information_schema as proxy
      can_insert: canCreate,
      can_update: canCreate,
      can_delete: canCreate,
      missing_permissions: [],
    };

    matrix.missing_permissions = buildMissing(matrix);
    return matrix;
  } finally {
    await client.end().catch(() => {});
  }
}

// ── MySQL ──────────────────────────────────────────────────────────────

async function checkMySQL(params: ConnectParams): Promise<PermissionMatrix> {
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    host: params.host,
    port: params.port ?? 3306,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? {} : undefined,
    connectTimeout: 5000,
  });

  try {
    const [rows] = await connection.query('SHOW GRANTS FOR CURRENT_USER()');
    const grants: string = Array.isArray(rows)
      ? rows.map((r: any) => Object.values(r)[0] as string).join('\n').toUpperCase()
      : '';

    const hasAll = grants.includes('ALL PRIVILEGES') || grants.includes('ALL ON *.*');
    const hasDDL = hasAll || grants.includes('CREATE') || grants.includes('ALTER') || grants.includes('DROP') || grants.includes('INDEX');

    const matrix: PermissionMatrix = {
      is_superuser: hasAll,
      can_create_schema: hasAll || grants.includes('CREATE SCHEMA') || grants.includes('CREATE ON *'),
      can_create_table: hasDDL,
      can_drop_table: hasAll || grants.includes('DROP'),
      can_alter_table: hasAll || grants.includes('ALTER'),
      can_create_index: hasDDL,
      can_drop_index: hasAll || grants.includes('INDEX') || grants.includes('DROP'),
      can_insert: hasAll || grants.includes('INSERT'),
      can_update: hasAll || grants.includes('UPDATE'),
      can_delete: hasAll || grants.includes('DELETE'),
      missing_permissions: [],
    };

    matrix.missing_permissions = buildMissing(matrix);
    return matrix;
  } finally {
    await connection.end().catch(() => {});
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function buildMissing(matrix: PermissionMatrix): string[] {
  const checks: (keyof Omit<PermissionMatrix, 'missing_permissions'>)[] = [
    'can_create_table',
    'can_alter_table',
    'can_create_index',
    'can_drop_table',
    'can_drop_index',
    'can_insert',
    'can_update',
    'can_delete',
    'can_create_schema',
  ];
  return checks
    .filter((k) => !matrix[k])
    .map((k) => k.replace('can_', '').replace(/_/g, ' ').toUpperCase());
}
