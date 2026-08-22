import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplacePayOSWithStripe1784786400000 implements MigrationInterface {
  name = 'ReplacePayOSWithStripe1784786400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME COLUMN "payos_order_code" TO "provider_checkout_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "provider_checkout_id" TYPE character varying USING "provider_checkout_id"::character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "provider_checkout_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ALTER COLUMN "provider" SET DEFAULT 'stripe'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ALTER COLUMN "provider" SET DEFAULT 'payos'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "provider_checkout_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "provider_checkout_id" TYPE bigint USING "provider_checkout_id"::bigint`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" RENAME COLUMN "provider_checkout_id" TO "payos_order_code"`,
    );
  }
}
