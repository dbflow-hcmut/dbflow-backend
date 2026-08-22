import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserScopeToUsageCounters1784793600000
  implements MigrationInterface
{
  readonly name = 'AddUserScopeToUsageCounters1784793600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usage_counters" ADD COLUMN IF NOT EXISTS "user_id" UUID;

      -- Rebuild counters as per-seat (workspace + user) from the usage_events
      -- ledger, which already records userId per operation. This replaces the
      -- old per-workspace pooled counters with an accurate per-member split
      -- instead of resetting everyone to zero.
      DELETE FROM "usage_counters";

      INSERT INTO "usage_counters"
        ("workspace_id", "user_id", "metric", "period_key", "used", "reserved", "updated_at")
      SELECT
        "workspace_id",
        "user_id",
        "metric",
        "period_key",
        COALESCE(SUM("quantity") FILTER (WHERE "status" = 'committed'), 0),
        COALESCE(SUM("quantity") FILTER (WHERE "status" = 'reserved'), 0),
        NOW()
      FROM "usage_events"
      GROUP BY "workspace_id", "user_id", "metric", "period_key";

      ALTER TABLE "usage_counters" ALTER COLUMN "user_id" SET NOT NULL;
      ALTER TABLE "usage_counters"
        ADD CONSTRAINT "fk_usage_counters_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

      ALTER TABLE "usage_counters" DROP CONSTRAINT "usage_counters_pkey";
      ALTER TABLE "usage_counters"
        ADD PRIMARY KEY ("workspace_id", "user_id", "metric", "period_key");

      CREATE INDEX "idx_usage_counters_workspace_metric_period"
        ON "usage_counters" ("workspace_id", "metric", "period_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_usage_counters_workspace_metric_period";

      ALTER TABLE "usage_counters" DROP CONSTRAINT "usage_counters_pkey";

      -- Best-effort reconstruction: collapse per-member counters back into
      -- one pooled row per workspace (sums across all members).
      CREATE TEMP TABLE "usage_counters_pooled" AS
      SELECT "workspace_id", "metric", "period_key",
        SUM("used") AS "used", SUM("reserved") AS "reserved"
      FROM "usage_counters"
      GROUP BY "workspace_id", "metric", "period_key";

      DELETE FROM "usage_counters";
      ALTER TABLE "usage_counters" DROP CONSTRAINT IF EXISTS "fk_usage_counters_user";
      ALTER TABLE "usage_counters" DROP COLUMN "user_id";

      INSERT INTO "usage_counters" ("workspace_id", "metric", "period_key", "used", "reserved", "updated_at")
      SELECT "workspace_id", "metric", "period_key", "used", "reserved", NOW()
      FROM "usage_counters_pooled";

      DROP TABLE "usage_counters_pooled";

      ALTER TABLE "usage_counters" ADD PRIMARY KEY ("workspace_id", "metric", "period_key");
    `);
  }
}
