import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenUsageToUsageEvents1784764800000
  implements MigrationInterface
{
  readonly name = 'AddTokenUsageToUsageEvents1784764800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usage_events"
        ADD COLUMN "input_tokens" BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN "output_tokens" BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN "model_calls" INTEGER NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_usage_events_status_created_at"
        ON "usage_events" ("status", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_usage_events_status_created_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "usage_events"
        DROP COLUMN "model_calls",
        DROP COLUMN "output_tokens",
        DROP COLUMN "input_tokens"
    `);
  }
}
