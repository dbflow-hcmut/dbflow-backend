import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayOSBillingTables1778700000000
  implements MigrationInterface
{
  readonly name = 'CreatePayOSBillingTables1778700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE order_status AS ENUM ('pending','paid','failed','canceled','expired');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
      DO $$ BEGIN
        CREATE TYPE payment_transaction_status AS ENUM ('succeeded','failed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      UPDATE "plans" SET
        "currency" = 'VND',
        "monthly_base_price" = CASE "code"
          WHEN 'pro' THEN 199000 WHEN 'team' THEN 499000 ELSE 0 END,
        "yearly_base_price" = CASE "code"
          WHEN 'pro' THEN 1990000 WHEN 'team' THEN 4990000 ELSE 0 END,
        "monthly_seat_price" = CASE WHEN "code" = 'team' THEN 79000 ELSE NULL END,
        "yearly_seat_price" = CASE WHEN "code" = 'team' THEN 790000 ELSE NULL END
      WHERE "version" = 1;

      CREATE TABLE "orders" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_number" VARCHAR NOT NULL UNIQUE,
        "payos_order_code" BIGINT NOT NULL UNIQUE,
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "created_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "plan_id" UUID NOT NULL REFERENCES "plans"("id") ON DELETE RESTRICT,
        "billing_cycle" billing_cycle NOT NULL,
        "quantity" INTEGER NOT NULL DEFAULT 1,
        "amount" BIGINT NOT NULL,
        "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
        "status" order_status NOT NULL DEFAULT 'pending',
        "payment_link_id" VARCHAR,
        "checkout_url" TEXT,
        "paid_at" TIMESTAMPTZ,
        "expires_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );

      CREATE TABLE "payment_transactions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "order_id" UUID NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
        "provider" VARCHAR(50) NOT NULL DEFAULT 'payos',
        "provider_transaction_id" VARCHAR NOT NULL UNIQUE,
        "amount" BIGINT NOT NULL,
        "currency" VARCHAR(3) NOT NULL,
        "status" payment_transaction_status NOT NULL,
        "raw_payload" JSONB NOT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "payment_transactions";
      DROP TABLE IF EXISTS "orders";
      DROP TYPE IF EXISTS payment_transaction_status;
      DROP TYPE IF EXISTS order_status;
    `);
  }
}
