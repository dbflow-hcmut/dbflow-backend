import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatTables1775000000000 implements MigrationInterface {
  readonly name = 'CreateChatTables1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_conversations" (
        "id" UUID PRIMARY KEY,
        "user_id" UUID NOT NULL,
        "title" VARCHAR(255) NOT NULL DEFAULT 'New Chat',
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_chat_conversations_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "idx_chat_conversations_user_id"
        ON "chat_conversations" ("user_id");

      CREATE INDEX IF NOT EXISTS "idx_chat_conversations_updated_at"
        ON "chat_conversations" ("updated_at" DESC);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversation_id" UUID NOT NULL,
        "role" VARCHAR(20) NOT NULL,
        "content" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_chat_messages_conversation"
          FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS "idx_chat_messages_conversation_id"
        ON "chat_messages" ("conversation_id");

      CREATE INDEX IF NOT EXISTS "idx_chat_messages_created_at"
        ON "chat_messages" ("conversation_id", "created_at" ASC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "chat_messages";
      DROP TABLE IF EXISTS "chat_conversations";
    `);
  }
}
