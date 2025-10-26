import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1735230000000 implements MigrationInterface {
  readonly name = 'CreateUsersTable1735230000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin', 'user', 'guest');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS "users" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" VARCHAR(255) NOT NULL UNIQUE,
        "full_name" VARCHAR(255) NOT NULL,
        "password" VARCHAR(255) NOT NULL,
        "role" user_role NOT NULL DEFAULT 'user',
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "users";
      DROP TYPE IF EXISTS user_role;
    `);
  }
}
