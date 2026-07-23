import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExcludePausedSubscriptionsFromCurrentIndex1784768400000
  implements MigrationInterface
{
  readonly name = 'ExcludePausedSubscriptionsFromCurrentIndex1784768400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_current_workspace_subscription"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_current_workspace_subscription"
        ON "subscriptions" ("workspace_id")
        WHERE "status" IN ('trialing', 'active', 'past_due')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_current_workspace_subscription"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_current_workspace_subscription"
        ON "subscriptions" ("workspace_id")
        WHERE "status" IN ('trialing', 'active', 'past_due', 'paused')
    `);
  }
}
