import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModelNameToUsageEvents1784775600000
  implements MigrationInterface
{
  readonly name = 'AddModelNameToUsageEvents1784775600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usage_events"
        ADD COLUMN "model_name" VARCHAR(120)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_usage_events_model_name"
        ON "usage_events" ("model_name")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_usage_events_model_name"
    `);
    await queryRunner.query(`
      ALTER TABLE "usage_events"
        DROP COLUMN "model_name"
    `);
  }
}
