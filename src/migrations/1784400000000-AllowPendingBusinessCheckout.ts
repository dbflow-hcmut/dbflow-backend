import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowPendingBusinessCheckout1784400000000
  implements MigrationInterface
{
  readonly name = 'AllowPendingBusinessCheckout1784400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "workspace_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "workspace_name" VARCHAR(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_workspace_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "orders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "orders" WHERE "workspace_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_workspace_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "workspace_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "orders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "workspace_name"`,
    );
  }
}
