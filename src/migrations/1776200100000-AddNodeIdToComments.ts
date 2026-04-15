import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNodeIdToComments1776200100000 implements MigrationInterface {
  name = 'AddNodeIdToComments1776200100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "comments" ADD COLUMN "node_id" varchar(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "comments" DROP COLUMN "node_id"`);
  }
}
