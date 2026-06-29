import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExportRecordsTable1776700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "export_record_status_enum" AS ENUM ('success', 'partial', 'failed');
    `);

    await queryRunner.query(`
      CREATE TYPE "export_record_trigger_enum" AS ENUM ('manual', 'auto');
    `);

    await queryRunner.query(`
      CREATE TABLE "export_records" (
        "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id"            UUID NOT NULL,
        "connection_id"         UUID NOT NULL,
        "triggered_by"          UUID NOT NULL,
        "trigger"               "export_record_trigger_enum" NOT NULL DEFAULT 'manual',
        "status"                "export_record_status_enum" NOT NULL DEFAULT 'success',
        "dbms"                  VARCHAR(50) NOT NULL,
        "ddl_snapshot_before"   TEXT NOT NULL,
        "up_migration"          TEXT NOT NULL,
        "down_migration"        TEXT NOT NULL,
        "schema_version_ref"    UUID,
        "notes"                 TEXT,
        "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_export_records_project_created"
        ON "export_records" ("project_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_export_records_project_created";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "export_records";`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "export_record_trigger_enum";`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "export_record_status_enum";`);
  }
}
