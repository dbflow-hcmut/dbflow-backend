import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateProjectInvitationSchema1773538728000
  implements MigrationInterface
{
  name = 'UpdateProjectInvitationSchema1773538728000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Temporarily add the email column as nullable
    await queryRunner.query(
      `ALTER TABLE "project_invitations" ADD "email" character varying`,
    );

    // 2. Populate the email column for existing rows.
    // Assuming we can get emails from the users table based on invited_user_id.
    // For rows where invited_user_id is missing or user is deleted, this might leave email null.
    // If you need a fallback, you could use a dummy email like 'unknown@example.com'.
    await queryRunner.query(
      `UPDATE "project_invitations" pi SET "email" = u."email" FROM "users" u WHERE pi."invited_user_id" = u."id"`,
    );

    // Fallback for any constraints, delete any pending invites that don't have an email match
    await queryRunner.query(
      `DELETE FROM "project_invitations" WHERE "email" IS NULL`,
    );

    // 3. Alter the email column to be NOT NULL now that it is populated
    await queryRunner.query(
      `ALTER TABLE "project_invitations" ALTER COLUMN "email" SET NOT NULL`,
    );

    // 4. Drop old index and foreign key constraints
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."uq_project_invitation_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_invitations" DROP CONSTRAINT IF EXISTS "fk_inv_invited_user"`,
    );

    // 5. Make invited_user_id nullable
    await queryRunner.query(
      `ALTER TABLE "project_invitations" ALTER COLUMN "invited_user_id" DROP NOT NULL`,
    );

    // 6. Create the new unique index
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_11f0ac985023e75beaf7d08b96" ON "project_invitations" ("project_id", "email", "status") `,
    );

    // 7. Add back the foreign key constraint
    await queryRunner.query(
      `ALTER TABLE "project_invitations" ADD CONSTRAINT "FK_e062ce7e8636d4a4dd713745afe" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "project_invitations" DROP CONSTRAINT "FK_e062ce7e8636d4a4dd713745afe"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_11f0ac985023e75beaf7d08b96"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_invitations" DROP COLUMN "email"`,
    );
    await queryRunner.query(
      `ALTER TABLE "project_invitations" ALTER COLUMN "invited_user_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_project_invitation_status" ON "project_invitations" ("project_id", "invited_user_id", "status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "project_invitations" ADD CONSTRAINT "fk_inv_invited_user" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
