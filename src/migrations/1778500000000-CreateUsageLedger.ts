import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsageLedger1778500000000 implements MigrationInterface {
  readonly name = 'CreateUsageLedger1778500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE usage_event_status AS ENUM ('reserved', 'committed', 'released');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE "usage_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "metric" VARCHAR(100) NOT NULL,
        "quantity" BIGINT NOT NULL DEFAULT 1,
        "operation_id" VARCHAR(100) NOT NULL UNIQUE,
        "period_key" VARCHAR(20) NOT NULL,
        "status" usage_event_status NOT NULL,
        "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );

      CREATE TABLE "usage_counters" (
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "metric" VARCHAR(100) NOT NULL,
        "period_key" VARCHAR(20) NOT NULL,
        "used" BIGINT NOT NULL DEFAULT 0,
        "reserved" BIGINT NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("workspace_id", "metric", "period_key")
      );

      CREATE INDEX "idx_usage_events_workspace_metric_period"
        ON "usage_events" ("workspace_id", "metric", "period_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "usage_counters";
      DROP TABLE IF EXISTS "usage_events";
      DROP TYPE IF EXISTS usage_event_status;
    `);
  }
}
