import {
  DbConnectionDbms,
  DbConnectionMethod,
  SshAuthType,
} from '@/common/enums/db-connection.enum';
import { Client as PgClient } from 'pg';
import type { QueryResult as PgQueryResult } from 'pg';

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
const QUERY_TIMEOUT_MS = 30000;
const DEFAULT_RESULT_LIMIT = 1000;

export interface QueryResult {
  success: boolean;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
  executionTimeMs: number;
  message?: string;
}

export async function executeQuery(
  params: ConnectParams,
  query: string,
  queryParams?: unknown[],
  options?: { timeoutMs?: number; resultLimit?: number },
): Promise<QueryResult> {
  const start = Date.now();
  const port = params.port ?? DEFAULT_PORTS[params.dbms];
  const timeoutMs = options?.timeoutMs ?? QUERY_TIMEOUT_MS;
  const resultLimit = options?.resultLimit ?? DEFAULT_RESULT_LIMIT;

  try {
    switch (params.dbms) {
      case DbConnectionDbms.PostgreSQL:
        return await executePostgres(
          params,
          port,
          query,
          queryParams,
          timeoutMs,
          resultLimit,
        );
      case DbConnectionDbms.MySQL:
        return await executeMySQL(
          params,
          port,
          query,
          queryParams,
          timeoutMs,
          resultLimit,
        );
      case DbConnectionDbms.SQLServer:
        return {
          success: false,
          rowCount: 0,
          columns: [],
          rows: [],
          executionTimeMs: Date.now() - start,
          message:
            'SQL Server driver (mssql) is not installed. Install it with: npm install mssql',
        };
      default:
        return {
          success: false,
          rowCount: 0,
          columns: [],
          rows: [],
          executionTimeMs: Date.now() - start,
          message: `Unsupported DBMS: ${params.dbms as string}`,
        };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      rowCount: 0,
      columns: [],
      rows: [],
      executionTimeMs: Date.now() - start,
      message: msg,
    };
  }
}

async function executePostgres(
  params: ConnectParams,
  port: number,
  query: string,
  queryParams: unknown[] | undefined,
  timeoutMs: number,
  resultLimit: number,
): Promise<QueryResult> {
  const client = new PgClient({
    host: params.host,
    port,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
  });
  client.on('error', () => {});

  try {
    await client.connect();

    // Append LIMIT clause if query doesn't have one and it's a SELECT
    const upperQuery = query.toUpperCase().trim();
    let finalQuery = query;
    if (upperQuery.startsWith('SELECT') && !upperQuery.includes('LIMIT')) {
      finalQuery = query.trimEnd().replace(/;$/, '') + ` LIMIT ${resultLimit};`;
    }

    const queryStart = Date.now();
    const rawResult: unknown = await client.query(finalQuery, queryParams);
    const executionTimeMs = Date.now() - queryStart;

    // pg returns QueryResult[] for multi-statement queries (e.g. SET search_path + SELECT)
    const result = getLastPgResultCandidate(rawResult);
    if (!isPgQueryResult(result)) {
      throw new Error('Unexpected PostgreSQL query result');
    }

    return {
      success: true,
      rowCount: result.rows.length,
      columns: result.fields.map((f) => f.name),
      rows: result.rows,
      executionTimeMs,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function getLastPgResultCandidate(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  const results = value as unknown[];
  return results[results.length - 1];
}

function isPgQueryResult(
  value: unknown,
): value is PgQueryResult<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as {
    rows?: unknown;
    fields?: unknown;
  };

  return Array.isArray(candidate.rows) && Array.isArray(candidate.fields);
}

async function executeMySQL(
  params: ConnectParams,
  port: number,
  query: string,
  queryParams: unknown[] | undefined,
  timeoutMs: number,
  resultLimit: number,
): Promise<QueryResult> {
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    host: params.host,
    port,
    database: params.database,
    user: params.username,
    password: params.password,
    ssl: params.ssl ? {} : undefined,
    connectTimeout: timeoutMs,
  });

  try {
    // Append LIMIT clause if query doesn't have one and it's a SELECT
    const upperQuery = query.toUpperCase().trim();
    let finalQuery = query;
    if (upperQuery.startsWith('SELECT') && !upperQuery.includes('LIMIT')) {
      finalQuery = query.trimEnd().replace(/;$/, '') + ` LIMIT ${resultLimit};`;
    }

    const queryStart = Date.now();
    const [rows, fields] = await connection.query(finalQuery, queryParams);
    const executionTimeMs = Date.now() - queryStart;
    const resultRows = toRecordRows(rows);

    return {
      success: true,
      rowCount: resultRows.length,
      columns: Array.isArray(fields) ? fields.map((f) => f.name) : [],
      rows: resultRows,
      executionTimeMs,
    };
  } finally {
    await connection.end().catch(() => {});
  }
}

function toRecordRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
        return {
          success: false,
          message: `Unsupported DBMS: ${params.dbms as string}`,
        };
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
  client.on('error', () => {});

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
