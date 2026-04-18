import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSchemaVersionsTable1776300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'schema_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'schema_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'version',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'label',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 's3_key',
            type: 'varchar',
            length: '512',
            isNullable: false,
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['schema_id'],
            referencedTableName: 'schemas',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['created_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      'schema_versions',
      new TableIndex({
        name: 'IDX_schema_versions_schema_version',
        columnNames: ['schema_id', 'version'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'schema_versions',
      new TableIndex({
        name: 'IDX_schema_versions_schema_created',
        columnNames: ['schema_id', 'created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('schema_versions');
  }
}
