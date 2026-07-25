import { MigrationInterface, QueryRunner } from 'typeorm';

export class ForcePlanCurrencyToVnd1784782800000 implements MigrationInterface {
  name = 'ForcePlanCurrencyToVnd1784782800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "plans" SET "currency" = 'VND' WHERE "currency" <> 'VND'`,
    );
    await queryRunner.query(
      `ALTER TABLE "plans" ALTER COLUMN "currency" SET DEFAULT 'VND'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plans" ALTER COLUMN "currency" SET DEFAULT 'USD'`,
    );
  }
}
