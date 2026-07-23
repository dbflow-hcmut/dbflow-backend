import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlansAndSubscriptions1778400000000
  implements MigrationInterface
{
  readonly name = 'CreatePlansAndSubscriptions1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE plan_workspace_type AS ENUM ('personal', 'team', 'any');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE subscription_status AS ENUM (
          'trialing', 'active', 'past_due', 'canceled', 'expired', 'paused'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly', 'custom');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS "plans" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" VARCHAR(50) NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 1,
        "name" VARCHAR(100) NOT NULL,
        "description" TEXT,
        "workspace_type" plan_workspace_type NOT NULL,
        "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
        "monthly_base_price" NUMERIC(12,2) NOT NULL DEFAULT 0,
        "yearly_base_price" NUMERIC(12,2) NOT NULL DEFAULT 0,
        "monthly_seat_price" NUMERIC(12,2),
        "yearly_seat_price" NUMERIC(12,2),
        "included_seats" INTEGER NOT NULL DEFAULT 1,
        "limits" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "features" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "display_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        UNIQUE ("code", "version")
      );

      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "plan_id" UUID NOT NULL REFERENCES "plans"("id") ON DELETE RESTRICT,
        "status" subscription_status NOT NULL DEFAULT 'active',
        "billing_cycle" billing_cycle NOT NULL,
        "quantity" INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" > 0),
        "provider" VARCHAR(50),
        "provider_customer_id" VARCHAR,
        "provider_subscription_id" VARCHAR UNIQUE,
        "current_period_start" TIMESTAMPTZ NOT NULL,
        "current_period_end" TIMESTAMPTZ NOT NULL,
        "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
        "canceled_at" TIMESTAMPTZ,
        "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX "uq_current_workspace_subscription"
        ON "subscriptions" ("workspace_id")
        WHERE "status" IN ('trialing', 'active', 'past_due', 'paused');
      CREATE INDEX "idx_subscriptions_workspace_id"
        ON "subscriptions" ("workspace_id");

      INSERT INTO "plans" (
        "code", "version", "name", "description", "workspace_type",
        "monthly_base_price", "yearly_base_price", "included_seats",
        "limits", "features", "display_order"
      ) VALUES
      (
        'free', 1, 'Free', 'Personal starter plan', 'personal',
        0, 0, 1,
        '{"projects":3,"schemas_per_project":3,"ai_requests_monthly":30,"db_connections":1,"document_storage_bytes":104857600,"workspace_seats":1}'::jsonb,
        '{"export":false,"rollback":false,"team_roles":false}'::jsonb,
        10
      ),
      (
        'pro', 1, 'Pro', 'Personal professional plan', 'personal',
        15, 144, 1,
        '{"projects":30,"schemas_per_project":20,"ai_requests_monthly":1000,"db_connections":10,"document_storage_bytes":5368709120,"workspace_seats":1}'::jsonb,
        '{"export":true,"rollback":true,"team_roles":false}'::jsonb,
        20
      ),
      (
        'team_free', 1, 'Team Free', 'Team trial plan', 'team',
        0, 0, 3,
        '{"projects":5,"schemas_per_project":5,"ai_requests_monthly":100,"db_connections":3,"document_storage_bytes":1073741824,"workspace_seats":3}'::jsonb,
        '{"export":false,"rollback":false,"team_roles":true}'::jsonb,
        30
      ),
      (
        'team', 1, 'Team', 'Paid team collaboration plan', 'team',
        39, 374, 5,
        '{"projects":100,"schemas_per_project":50,"ai_requests_monthly":5000,"db_connections":30,"document_storage_bytes":26843545600,"workspace_seats":5}'::jsonb,
        '{"export":true,"rollback":true,"team_roles":true,"audit_log":true}'::jsonb,
        40
      )
      ON CONFLICT ("code", "version") DO NOTHING;

      INSERT INTO "subscriptions" (
        "workspace_id", "plan_id", "status", "billing_cycle", "quantity",
        "current_period_start", "current_period_end"
      )
      SELECT
        w."id",
        p."id",
        'active',
        'custom',
        p."included_seats",
        NOW(),
        NOW() + INTERVAL '100 years'
      FROM "workspaces" w
      JOIN "plans" p
        ON p."code" = CASE WHEN w."type" = 'team' THEN 'team_free' ELSE 'free' END
        AND p."version" = 1
      WHERE NOT EXISTS (
        SELECT 1 FROM "subscriptions" s
        WHERE s."workspace_id" = w."id"
          AND s."status" IN ('trialing', 'active', 'past_due', 'paused')
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "subscriptions";
      DROP TABLE IF EXISTS "plans";
      DROP TYPE IF EXISTS billing_cycle;
      DROP TYPE IF EXISTS subscription_status;
      DROP TYPE IF EXISTS plan_workspace_type;
    `);
  }
}
