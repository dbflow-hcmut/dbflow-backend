import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropSchemaUniqueNameConstraint1776300100000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_schemas_project_name";`,
    );
    // Also drop TypeORM auto-generated index if it exists
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_schemas_projectId_name";`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_schemas_project_name"
      ON "schemas" ("project_id", "name");
    `);
  }
}
