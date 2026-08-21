import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripeInvoiceId1784790000000 implements MigrationInterface {
  name = 'AddStripeInvoiceId1784790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "provider_invoice_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "UQ_orders_provider_invoice_id" UNIQUE ("provider_invoice_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "UQ_orders_provider_invoice_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "provider_invoice_id"`,
    );
  }
}
