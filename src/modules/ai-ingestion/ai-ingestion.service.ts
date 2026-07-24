import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface IngestPayload {
  documentId: string;
  projectId: string;
  s3Key: string;
  mimeType: string;
  fileName: string;
  title: string;
}

export interface GenerateSqlPayload {
  nl_query: string;
  dbms: string;
  schema_tables: unknown[];
  project_id?: string;
}

export interface GenerateSqlResult {
  sql: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

@Injectable()
export class AiIngestionService {
  private readonly logger = new Logger(AiIngestionService.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('AI_INGEST_URL', 'http://localhost:8001');
  }

  async ingestDocument(payload: IngestPayload): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.status.toString());
      throw new Error(`AI ingest failed [${res.status}]: ${text}`);
    }
  }

  async generateSql(payload: GenerateSqlPayload): Promise<GenerateSqlResult> {
    const res = await fetch(`${this.baseUrl}/api/text-to-sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.status.toString());
      throw new Error(`AI text-to-sql failed [${res.status}]: ${text}`);
    }
    return res.json() as Promise<GenerateSqlResult>;
  }

  async removeDocument(documentId: string, projectId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/ingest/${projectId}/${documentId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(15_000),
    }).catch((err: unknown) => {
      this.logger.warn(
        `removeDocument failed for ${documentId}: ${String(err)}`,
      );
    });
  }
}
