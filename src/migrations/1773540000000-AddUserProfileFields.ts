import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileFields1773540000000 implements MigrationInterface {
  readonly name = 'AddUserProfileFields1773540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "last_name" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "bio" TEXT;
    `);

    // Migrate existing fullName data to firstName and lastName
    await queryRunner.query(`
      UPDATE "users"
      SET 
        "first_name" = CASE 
          WHEN position(' ' in full_name) > 0 
          THEN substring(full_name from 1 for position(' ' in full_name) - 1)
          ELSE full_name
        END,
        "last_name" = CASE 
          WHEN position(' ' in full_name) > 0 
          THEN substring(full_name from position(' ' in full_name) + 1)
          ELSE ''
        END
      WHERE "first_name" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "first_name",
      DROP COLUMN IF EXISTS "last_name",
      DROP COLUMN IF EXISTS "phone",
      DROP COLUMN IF EXISTS "bio";
    `);
  }
}
