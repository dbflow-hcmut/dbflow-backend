import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaceOwnershipToResources1778300000000
  implements MigrationInterface
{
  readonly name = 'AddWorkspaceOwnershipToResources1778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "workspace_id" UUID;
      ALTER TABLE "db_connections" ADD COLUMN IF NOT EXISTS "workspace_id" UUID;

      UPDATE "projects" p
      SET "workspace_id" = w."id"
      FROM "workspaces" w
      WHERE w."owner_user_id" = p."owner_id"
        AND w."type" = 'personal'
        AND p."workspace_id" IS NULL;

      UPDATE "db_connections" d
      SET "workspace_id" = w."id"
      FROM "workspaces" w
      WHERE w."owner_user_id" = d."created_by"
        AND w."type" = 'personal'
        AND d."workspace_id" IS NULL;

      ALTER TABLE "projects" ALTER COLUMN "workspace_id" SET NOT NULL;
      ALTER TABLE "db_connections" ALTER COLUMN "workspace_id" SET NOT NULL;

      ALTER TABLE "projects"
        ADD CONSTRAINT "fk_projects_workspace"
        FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
        ON DELETE RESTRICT;
      ALTER TABLE "db_connections"
        ADD CONSTRAINT "fk_db_connections_workspace"
        FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
        ON DELETE RESTRICT;

      CREATE INDEX "idx_projects_workspace_id" ON "projects"("workspace_id");
      CREATE INDEX "idx_db_connections_workspace_id"
        ON "db_connections"("workspace_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_db_connections_workspace_id";
      DROP INDEX IF EXISTS "idx_projects_workspace_id";
      ALTER TABLE "db_connections"
        DROP CONSTRAINT IF EXISTS "fk_db_connections_workspace";
      ALTER TABLE "projects"
        DROP CONSTRAINT IF EXISTS "fk_projects_workspace";
      ALTER TABLE "db_connections" DROP COLUMN IF EXISTS "workspace_id";
      ALTER TABLE "projects" DROP COLUMN IF EXISTS "workspace_id";
    `);
  }
}
