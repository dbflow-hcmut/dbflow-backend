import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDbConnectionsTables1776500000000
  implements MigrationInterface
{
  readonly name = 'CreateDbConnectionsTables1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE db_connection_dbms AS ENUM ('postgresql', 'mysql', 'sqlserver');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE db_connection_method AS ENUM ('direct', 'ssh', 'local_agent');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE db_connection_status AS ENUM ('connected', 'failed', 'untested');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE ssh_auth_type AS ENUM ('password', 'private_key');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS "db_connections" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" VARCHAR(255) NOT NULL,
        "dbms" db_connection_dbms NOT NULL,
        "method" db_connection_method NOT NULL DEFAULT 'direct',
        "status" db_connection_status NOT NULL DEFAULT 'untested',
        "host" VARCHAR(255) NOT NULL,
        "port" INTEGER,
        "database" VARCHAR(255) NOT NULL,
        "username" VARCHAR(255),
        "password_encrypted" TEXT,
        "ssl" BOOLEAN NOT NULL DEFAULT false,
        "ssh_host" VARCHAR(255),
        "ssh_port" INTEGER,
        "ssh_username" VARCHAR(255),
        "ssh_auth_type" ssh_auth_type,
        "ssh_password_encrypted" TEXT,
        "ssh_private_key_encrypted" TEXT,
        "last_tested_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS "project_db_connections" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
        "db_connection_id" UUID NOT NULL REFERENCES "db_connections"("id") ON DELETE CASCADE,
        "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        UNIQUE ("project_id", "db_connection_id")
      );

      CREATE INDEX IF NOT EXISTS "idx_db_connections_created_by" ON "db_connections"("created_by");
      CREATE INDEX IF NOT EXISTS "idx_project_db_connections_project_id" ON "project_db_connections"("project_id");
      CREATE INDEX IF NOT EXISTS "idx_project_db_connections_db_connection_id" ON "project_db_connections"("db_connection_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "project_db_connections";
      DROP TABLE IF EXISTS "db_connections";
      DROP TYPE IF EXISTS ssh_auth_type;
      DROP TYPE IF EXISTS db_connection_status;
      DROP TYPE IF EXISTS db_connection_method;
      DROP TYPE IF EXISTS db_connection_dbms;
    `);
  }
}
