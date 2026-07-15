import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSchemaSandboxesTable1778000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'schema_sandboxes',
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
            isUnique: true,
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 's3_key',
            type: 'varchar',
            length: '512',
            isNullable: false,
          },
          {
            name: 'model_snapshot_s3_key',
            type: 'varchar',
            length: '512',
            isNullable: false,
          },
          {
            name: 'built_from_model_hash',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'last_used_at',
            type: 'timestamptz',
            precision: 6,
            isNullable: false,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
          },
          {
            name: 'updated_at',
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
        ],
      }),
    );

    await queryRunner.createIndex(
      'schema_sandboxes',
      new TableIndex({
        name: 'IDX_schema_sandboxes_project',
        columnNames: ['project_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('schema_sandboxes');
  }
}
