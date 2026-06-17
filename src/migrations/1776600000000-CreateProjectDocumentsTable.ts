import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectDocumentsTable1776600000000
  implements MigrationInterface
{
  readonly name = 'CreateProjectDocumentsTable1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE project_document_source AS ENUM ('hub_upload', 'ai_chat_upload');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE project_document_status AS ENUM ('uploaded', 'processing', 'ready', 'failed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS "project_documents" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "uploaded_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "title" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "file_name" VARCHAR(255) NOT NULL,
        "s3_key" TEXT NOT NULL,
        "mime_type" VARCHAR(120) NOT NULL,
        "size" INTEGER NOT NULL,
        "source" project_document_source NOT NULL DEFAULT 'hub_upload',
        "status" project_document_status NOT NULL DEFAULT 'ready',
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
      );

      CREATE INDEX IF NOT EXISTS "idx_project_documents_project_created"
        ON "project_documents"("project_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "project_documents";
      DROP TYPE IF EXISTS project_document_status;
      DROP TYPE IF EXISTS project_document_source;
    `);
  }
}
