import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminAuditAndUserStatus1778800000000
  implements MigrationInterface
{
  readonly name = 'CreateAdminAuditAndUserStatus1778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE user_status AS ENUM ('active', 'suspended');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "status" user_status NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "suspended_reason" TEXT;

      CREATE TABLE "admin_audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "admin_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "action" VARCHAR(100) NOT NULL,
        "target_type" VARCHAR(100) NOT NULL,
        "target_id" VARCHAR(255) NOT NULL,
        "before_data" JSONB,
        "after_data" JSONB,
        "reason" TEXT,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "idx_admin_audit_created_at"
        ON "admin_audit_logs" ("created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "admin_audit_logs";
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "suspended_reason",
        DROP COLUMN IF EXISTS "suspended_at",
        DROP COLUMN IF EXISTS "status";
      DROP TYPE IF EXISTS user_status;
    `);
  }
}
