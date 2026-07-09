// eslint-disable-next-line @typescript-eslint/no-require-imports
import Database = require('better-sqlite3');
import { buildFullDDL } from './sqlite-ddl-builder';
import { PhysicalModelPayload } from './sandbox.types';

function sampleModel(): PhysicalModelPayload {
  return {
    model: { id: 'pid_shop', name: 'shop', dbms: 'postgresql' },
    tables: [
      {
        id: 't_users',
        name: 'users',
        columns: [
          {
            id: 'c_users_id',
            name: 'id',
            dataType: 'integer',
            nullable: false,
            unique: true,
            autoIncrement: true,
            roles: { primaryKey: true },
          },
          {
            id: 'c_users_email',
            name: 'email',
            dataType: 'varchar',
            length: '255',
            nullable: false,
            unique: true,
          },
        ],
        indexes: [
          {
            id: 'idx_users_email',
            name: 'idx_email',
            columns: [{ columnName: 'email' }],
            isUnique: true,
          },
        ],
      },
      {
        id: 't_orders',
        name: 'orders',
        columns: [
          {
            id: 'c_orders_id',
            name: 'id',
            dataType: 'integer',
            nullable: false,
            unique: true,
            autoIncrement: true,
            roles: { primaryKey: true },
          },
          {
            id: 'c_orders_user_id',
            name: 'user_id',
            dataType: 'integer',
            nullable: false,
            unique: false,
            roles: {
              foreignKey: {
                refTableId: 't_users',
                refColumnId: 'c_users_id',
                onDelete: 'CASCADE',
                onUpdate: 'NO ACTION',
              },
            },
          },
          {
            id: 'c_orders_total',
            name: 'total',
            dataType: 'decimal',
            nullable: true,
            unique: false,
            defaultValue: '0',
          },
        ],
      },
    ],
  };
}

describe('buildFullDDL', () => {
  it('creates tables in FK-safe order and executes cleanly against real sqlite', () => {
    const db = new Database(':memory:');
    const statements = buildFullDDL(sampleModel());

    expect(() => {
      for (const stmt of statements) db.exec(stmt);
    }).not.toThrow();

    db.prepare("INSERT INTO users (email) VALUES ('a@b.com')").run();
    const user = db.prepare('SELECT * FROM users').get() as { id: number };
    db.prepare('INSERT INTO orders (user_id, total) VALUES (?, ?)').run(
      user.id,
      99.5,
    );

    const orders = db.prepare('SELECT * FROM orders').all();
    expect(orders).toHaveLength(1);

    db.close();
  });

  it('reverses a table order so the parent (users) is still created before the FK-dependent child (orders)', () => {
    const model = sampleModel();
    model.tables = [...model.tables].reverse(); // orders declared before users
    const db = new Database(':memory:');
    expect(() => {
      for (const stmt of buildFullDDL(model)) db.exec(stmt);
    }).not.toThrow();
    db.close();
  });

  it('enforces the foreign key relationship once PRAGMA foreign_keys is on', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const stmt of buildFullDDL(sampleModel())) db.exec(stmt);

    expect(() =>
      db.prepare('INSERT INTO orders (user_id, total) VALUES (999, 1)').run(),
    ).toThrow();

    db.close();
  });
});
