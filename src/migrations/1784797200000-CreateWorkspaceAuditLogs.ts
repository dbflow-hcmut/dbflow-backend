import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkspaceAuditLogs1784797200000
  implements MigrationInterface
{
  readonly name = 'CreateWorkspaceAuditLogs1784797200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workspace_audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "actor_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "action" VARCHAR(100) NOT NULL,
        "target_type" VARCHAR(100) NOT NULL,
        "target_id" VARCHAR(255) NOT NULL,
        "before_data" JSONB,
        "after_data" JSONB,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "idx_workspace_audit_workspace_created_at"
        ON "workspace_audit_logs" ("workspace_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "workspace_audit_logs";
    `);
  }
}
