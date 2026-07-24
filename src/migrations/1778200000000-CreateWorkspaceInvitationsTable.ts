import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkspaceInvitationsTable1778200000000
  implements MigrationInterface
{
  readonly name = 'CreateWorkspaceInvitationsTable1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE workspace_invitation_status AS ENUM (
          'pending', 'accepted', 'revoked', 'expired'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS "workspace_invitations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "email" VARCHAR(255) NOT NULL,
        "role" workspace_role NOT NULL,
        "token_hash" VARCHAR(64) NOT NULL UNIQUE,
        "invited_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" workspace_invitation_status NOT NULL DEFAULT 'pending',
        "expires_at" TIMESTAMPTZ NOT NULL,
        "accepted_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS "idx_workspace_invitations_workspace_email_status"
        ON "workspace_invitations" ("workspace_id", "email", "status");
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_pending_workspace_invitation"
        ON "workspace_invitations" ("workspace_id", LOWER("email"))
        WHERE "status" = 'pending';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "workspace_invitations";
      DROP TYPE IF EXISTS workspace_invitation_status;
    `);
  }
}
