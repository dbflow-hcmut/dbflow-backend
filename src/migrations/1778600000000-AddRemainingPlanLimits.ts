import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRemainingPlanLimits1778600000000 implements MigrationInterface {
  readonly name = 'AddRemainingPlanLimits1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "plans"
      SET "limits" = "limits" || CASE "code"
        WHEN 'free' THEN '{"exports_monthly":5,"schema_versions_per_schema":5}'::jsonb
        WHEN 'pro' THEN '{"exports_monthly":null,"schema_versions_per_schema":100}'::jsonb
        WHEN 'team_free' THEN '{"exports_monthly":20,"schema_versions_per_schema":20}'::jsonb
        WHEN 'team' THEN '{"exports_monthly":null,"schema_versions_per_schema":500}'::jsonb
        ELSE '{}'::jsonb
      END
      WHERE "version" = 1;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "plans"
      SET "limits" = "limits" - 'exports_monthly' - 'schema_versions_per_schema'
      WHERE "version" = 1;
    `);
  }
}
