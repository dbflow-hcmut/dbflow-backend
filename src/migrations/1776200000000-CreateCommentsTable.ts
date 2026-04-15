import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCommentsTable1776200000000 implements MigrationInterface {
  name = 'CreateCommentsTable1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "schema_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "x" double precision NOT NULL,
        "y" double precision NOT NULL,
        "content" text NOT NULL,
        "parent_id" uuid,
        "resolved" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_comments_schema_resolved" ON "comments" ("schema_id", "resolved")
    `);

    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD CONSTRAINT "FK_comments_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD CONSTRAINT "FK_comments_schema" FOREIGN KEY ("schema_id") REFERENCES "schemas"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD CONSTRAINT "FK_comments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "comments"
        ADD CONSTRAINT "FK_comments_parent" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "comments"`);
  }
}
