import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration17638871171871763887117576 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
          DO $$ BEGIN
            CREATE TYPE schema_type AS ENUM ('conceptual', 'logical', 'physical');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;

          CREATE TABLE IF NOT EXISTS "schemas" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "project_id" UUID NOT NULL,
            "name" VARCHAR(255) NOT NULL DEFAULT 'Untitled Schema',
            "type" schema_type NOT NULL,
            "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
            "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

            CONSTRAINT "fk_schemas_project" FOREIGN KEY ("project_id")
              REFERENCES "projects"("id") ON DELETE CASCADE
          );

          CREATE UNIQUE INDEX IF NOT EXISTS "uq_schemas_project_name"
            ON "schemas"("project_id", "name");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
          DROP INDEX IF EXISTS "uq_schemas_project_name";
          DROP TABLE IF EXISTS "schemas";
          DROP TYPE IF EXISTS schema_type;
        `);
    }

}
