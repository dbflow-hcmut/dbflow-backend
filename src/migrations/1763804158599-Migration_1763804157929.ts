import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration17638041579291763804158599 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          DO $$ BEGIN
            CREATE TYPE user_project_permission AS ENUM ('viewer', 'editor');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
    
          DO $$ BEGIN
            CREATE TYPE project_visibility AS ENUM ('owner_and_invited', 'anyone_can_view', 'anyone_can_edit');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
    
          DO $$ BEGIN
            CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'rejected');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
    
          CREATE TABLE IF NOT EXISTS "projects" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "owner_id" UUID NOT NULL,
            "name" VARCHAR(255) NOT NULL DEFAULT 'Untitled Diagram',
            "visibility" project_visibility NOT NULL DEFAULT 'owner_and_invited',
            "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
            "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    
            CONSTRAINT "fk_projects_owner" FOREIGN KEY ("owner_id")
              REFERENCES "users"("id") ON DELETE CASCADE
          );
    
    
          CREATE TABLE IF NOT EXISTS "user_projects" (
            "user_id" UUID NOT NULL,
            "project_id" UUID NOT NULL,
            "permission" user_project_permission NOT NULL,
    
            CONSTRAINT "pk_user_projects" PRIMARY KEY ("user_id", "project_id"),
    
            CONSTRAINT "fk_user_projects_user" FOREIGN KEY ("user_id")
              REFERENCES "users"("id") ON DELETE CASCADE,
    
            CONSTRAINT "fk_user_projects_project" FOREIGN KEY ("project_id")
              REFERENCES "projects"("id") ON DELETE CASCADE
          );
    
    
          CREATE TABLE IF NOT EXISTS "project_invitations" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
            "project_id" UUID NOT NULL,
            "invited_user_id" UUID NOT NULL,
            "inviter_user_id" UUID NOT NULL,
    
            "permission" user_project_permission NOT NULL,
            "status" invite_status NOT NULL DEFAULT 'pending',
    
            "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
            "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    
            CONSTRAINT "fk_inv_project" FOREIGN KEY ("project_id")
              REFERENCES "projects"("id") ON DELETE CASCADE,
    
            CONSTRAINT "fk_inv_invited_user" FOREIGN KEY ("invited_user_id")
              REFERENCES "users"("id") ON DELETE CASCADE,
    
            CONSTRAINT "fk_inv_inviter_user" FOREIGN KEY ("inviter_user_id")
              REFERENCES "users"("id") ON DELETE CASCADE
          );
    
          CREATE UNIQUE INDEX IF NOT EXISTS "uq_project_invitation_status"
            ON "project_invitations"("project_id", "invited_user_id", "status");
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          DROP INDEX IF EXISTS "uq_project_invitation_status";
    
          DROP TABLE IF EXISTS "project_invitations";
          DROP TABLE IF EXISTS "user_projects";
          DROP TABLE IF EXISTS "projects";
    
          DROP TYPE IF EXISTS invite_status;
          DROP TYPE IF EXISTS project_visibility;
          DROP TYPE IF EXISTS user_project_permission;
        `);
  }
}
