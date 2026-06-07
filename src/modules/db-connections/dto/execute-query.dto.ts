export class ExecuteQueryDto {
  query: string;
  parameters?: any[];
  timeoutMs?: number;
  resultLimit?: number;
}

export class QueryResultDto {
  success: boolean;
  rowCount: number;
  columns: string[];
  rows: any[];
  executionTimeMs: number;
  message?: string;
}
