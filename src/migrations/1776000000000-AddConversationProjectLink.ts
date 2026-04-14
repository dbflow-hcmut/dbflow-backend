import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddConversationProjectLink1776000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'chat_conversations',
      new TableColumn({
        name: 'project_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'chat_conversations',
      new TableColumn({
        name: 'schema_id',
        type: 'uuid',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('chat_conversations', 'schema_id');
    await queryRunner.dropColumn('chat_conversations', 'project_id');
  }
}
