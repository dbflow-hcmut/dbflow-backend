import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkspacesTables1778100000000 implements MigrationInterface {
  readonly name = 'CreateWorkspacesTables1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE workspace_type AS ENUM ('personal', 'team');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE workspace_status AS ENUM ('active', 'suspended', 'archived');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'billing', 'member', 'viewer');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE workspace_member_status AS ENUM ('active', 'suspended');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS "workspaces" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" workspace_type NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "slug" VARCHAR(100) NOT NULL UNIQUE,
        "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "status" workspace_status NOT NULL DEFAULT 'active',
        "avatar_key" VARCHAR(1000),
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "uq_personal_workspace_owner"
        ON "workspaces" ("owner_user_id") WHERE "type" = 'personal';
      CREATE INDEX IF NOT EXISTS "idx_workspaces_owner_user_id"
        ON "workspaces" ("owner_user_id");

      CREATE TABLE IF NOT EXISTS "workspace_members" (
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" workspace_role NOT NULL,
        "status" workspace_member_status NOT NULL DEFAULT 'active',
        "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("workspace_id", "user_id")
      );

      CREATE INDEX IF NOT EXISTS "idx_workspace_members_user_id"
        ON "workspace_members" ("user_id");

      INSERT INTO "workspaces" (
        "type", "name", "slug", "owner_user_id", "status"
      )
      SELECT
        'personal',
        COALESCE(NULLIF(TRIM(u."full_name"), ''), 'My') || ' Workspace',
        'personal-' || u."id"::text,
        u."id",
        'active'
      FROM "users" u
      WHERE NOT EXISTS (
        SELECT 1 FROM "workspaces" w
        WHERE w."owner_user_id" = u."id" AND w."type" = 'personal'
      );

      INSERT INTO "workspace_members" (
        "workspace_id", "user_id", "role", "status"
      )
      SELECT w."id", w."owner_user_id", 'owner', 'active'
      FROM "workspaces" w
      WHERE w."type" = 'personal'
      ON CONFLICT ("workspace_id", "user_id") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "workspace_members";
      DROP TABLE IF EXISTS "workspaces";
      DROP TYPE IF EXISTS workspace_member_status;
      DROP TYPE IF EXISTS workspace_role;
      DROP TYPE IF EXISTS workspace_status;
      DROP TYPE IF EXISTS workspace_type;
    `);
  }
}
