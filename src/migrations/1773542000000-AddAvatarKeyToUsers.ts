import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarKeyToUsers1773542000000 implements MigrationInterface {
  readonly name = 'AddAvatarKeyToUsers1773542000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "avatar_key" VARCHAR(1000);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "avatar_key";
    `);
  }
}
