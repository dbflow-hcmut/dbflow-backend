import {
  DbConnectionDbms,
  DbConnectionMethod,
  SshAuthType,
} from '@/common/enums/db-connection.enum';
import { Client as PgClient } from 'pg';

export interface ConnectParams {
  dbms: DbConnectionDbms;
  method: DbConnectionMethod;
  host: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  sshAuthType?: SshAuthType;
  sshPassword?: string;
  sshPrivateKey?: string;
}

const DEFAULT_PORTS: Record<DbConnectionDbms, number> = {
  [DbConnectionDbms.PostgreSQL]: 5432,
  [DbConnectionDbms.MySQL]: 3306,
  [DbConnectionDbms.SQLServer]: 1433,
};

const TIMEOUT_MS = 5000;

export async function testConnection(
  params: ConnectParams,
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  const port = params.port ?? DEFAULT_PORTS[params.dbms];

  try {
    switch (params.dbms) {
      case DbConnectionDbms.PostgreSQL:
        await testPostgres(params, port);
        break;
      case DbConnectionDbms.MySQL:
        await testMySQL(params, port);
        break;
      case DbConnectionDbms.SQLServer:
        return {
          success: false,
          message:
            'SQL Server driver (mssql) is not installed. Install it with: npm install mssql',
        };
      default:
        return { success: false, message: `Unsupported DBMS: ${params.dbms}` };
    }

    return {
      success: true,
      message: 'Connection successful',
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: msg,
      latencyMs: Date.now() - start,
    };
  }
}

async function testPostgres(params: ConnectParams, port: number) {
  const client = new PgClient({
    host: params.host,
    port,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: TIMEOUT_MS,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => {});
  }
}

async function testMySQL(params: ConnectParams, port: number) {
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    host: params.host,
    port,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? {} : undefined,
    connectTimeout: TIMEOUT_MS,
  });

  try {
    await connection.query('SELECT 1');
  } finally {
    await connection.end().catch(() => {});
  }
}
