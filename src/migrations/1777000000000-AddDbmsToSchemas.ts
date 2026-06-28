import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDbmsToSchemas1777000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schemas" ADD COLUMN "dbms" varchar(20) DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "schemas" DROP COLUMN "dbms"`);
  }
}
