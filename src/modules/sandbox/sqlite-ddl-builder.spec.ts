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

  it('groups references to every target composite-PK column into one composite foreign key', () => {
    const model: PhysicalModelPayload = {
      model: { id: 'pid_school', name: 'school', dbms: 'postgresql' },
      tables: [
        {
          id: 't_section',
          name: 'Section',
          columns: [
            {
              id: 'c_section_course',
              name: 'Course_id',
              dataType: 'integer',
              nullable: false,
              unique: false,
              roles: { primaryKey: true },
            },
            {
              id: 'c_section_number',
              name: 'section_number',
              dataType: 'integer',
              nullable: false,
              unique: false,
              roles: { primaryKey: true },
            },
          ],
        },
        {
          id: 't_enrollment',
          name: 'enrollment',
          columns: [
            {
              id: 'c_enrollment_student',
              name: 'Student_id',
              dataType: 'integer',
              nullable: false,
              unique: false,
              roles: { primaryKey: true },
            },
            {
              id: 'c_enrollment_course',
              name: 'Course_id',
              dataType: 'integer',
              nullable: false,
              unique: false,
              roles: {
                primaryKey: true,
                foreignKey: {
                  refTableId: 't_section',
                  refColumnId: 'c_section_course',
                },
              },
            },
            {
              id: 'c_enrollment_section',
              name: 'section_number',
              dataType: 'integer',
              nullable: false,
              unique: false,
              roles: {
                primaryKey: true,
                foreignKey: {
                  refTableId: 't_section',
                  refColumnId: 'c_section_number',
                },
              },
            },
          ],
        },
      ],
    };
    const statements = buildFullDDL(model);
    const enrollmentDdl = statements.find((statement) =>
      statement.startsWith('CREATE TABLE "enrollment"'),
    );

    expect(enrollmentDdl).toContain(
      'FOREIGN KEY ("Course_id", "section_number") REFERENCES "Section"("Course_id", "section_number")',
    );
    expect(enrollmentDdl).not.toContain(
      'FOREIGN KEY ("Course_id") REFERENCES "Section"("Course_id")',
    );

    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    for (const statement of statements) db.exec(statement);
    db.exec(
      'INSERT INTO "Section" ("Course_id", "section_number") VALUES (1, 1), (1, 2)',
    );

    expect(() =>
      db.exec(
        'INSERT INTO "enrollment" ("Student_id", "Course_id", "section_number") VALUES (10, 1, 2)',
      ),
    ).not.toThrow();
    expect(() =>
      db.exec(
        'INSERT INTO "enrollment" ("Student_id", "Course_id", "section_number") VALUES (11, 2, 1)',
      ),
    ).toThrow(/FOREIGN KEY constraint failed/);
    db.close();
  });

  it('keeps repeated references to the same single-column key as separate foreign keys', () => {
    const model = sampleModel();
    model.tables[1].columns.push({
      id: 'c_orders_approver_id',
      name: 'approver_id',
      dataType: 'integer',
      nullable: true,
      unique: false,
      roles: {
        foreignKey: {
          refTableId: 't_users',
          refColumnId: 'c_users_id',
        },
      },
    });

    const ordersDdl = buildFullDDL(model).find((statement) =>
      statement.startsWith('CREATE TABLE "orders"'),
    );
    expect(ordersDdl?.match(/REFERENCES "users"\("id"\)/g)).toHaveLength(2);
  });
});
