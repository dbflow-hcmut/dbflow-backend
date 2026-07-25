import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiModelToPlans1784779200000 implements MigrationInterface {
  readonly name = 'AddAiModelToPlans1784779200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plans"
        ADD COLUMN "ai_model" VARCHAR(120)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plans"
        DROP COLUMN "ai_model"
    `);
  }
}
