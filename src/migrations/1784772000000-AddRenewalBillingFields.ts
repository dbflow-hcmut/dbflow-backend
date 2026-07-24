import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRenewalBillingFields1784772000000
  implements MigrationInterface
{
  name = 'AddRenewalBillingFields1784772000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "subscription_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "renewal_period_start" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "renewal_period_end" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_subscription" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_open_renewal_order" ON "orders" ("subscription_id", "renewal_period_start") WHERE "subscription_id" IS NOT NULL AND "status" <> 'canceled'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_open_renewal_order"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_subscription"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "renewal_period_end"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "renewal_period_start"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "subscription_id"`,
    );
  }
}
