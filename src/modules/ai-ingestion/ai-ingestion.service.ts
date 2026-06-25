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
