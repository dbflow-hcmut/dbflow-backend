import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGroups1784800800000 implements MigrationInterface {
  readonly name = 'CreateGroups1784800800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "groups" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "name" VARCHAR(100) NOT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );
      CREATE INDEX "idx_groups_workspace_id" ON "groups" ("workspace_id");

      CREATE TABLE "group_members" (
        "group_id" UUID NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        PRIMARY KEY ("group_id", "user_id")
      );

      ALTER TABLE "projects"
        ADD COLUMN "group_id" UUID REFERENCES "groups"("id") ON DELETE SET NULL;
      CREATE INDEX "idx_projects_group_id" ON "projects" ("group_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_projects_group_id";
      ALTER TABLE "projects" DROP COLUMN IF EXISTS "group_id";
      DROP TABLE IF EXISTS "group_members";
      DROP INDEX IF EXISTS "idx_groups_workspace_id";
      DROP TABLE IF EXISTS "groups";
    `);
  }
}
