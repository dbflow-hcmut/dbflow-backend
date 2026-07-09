// eslint-disable-next-line @typescript-eslint/no-require-imports
import Database = require('better-sqlite3');
import { provisionSandbox, syncSandbox } from './sandbox-sync';
import { PhysicalModelPayload } from './sandbox.types';

function baseModel(): PhysicalModelPayload {
  return {
    model: { id: 'pid_shop', name: 'shop', dbms: 'postgresql' },
    tables: [
      {
        id: 't_users',
        name: 'users',
        columns: [
          {
            id: 'c_id',
            name: 'id',
            dataType: 'integer',
            nullable: false,
            unique: true,
            autoIncrement: true,
            roles: { primaryKey: true },
          },
          {
            id: 'c_email',
            name: 'email',
            dataType: 'varchar',
            nullable: false,
            unique: true,
          },
        ],
      },
      {
        id: 't_products',
        name: 'products',
        columns: [
          {
            id: 'p_id',
            name: 'id',
            dataType: 'integer',
            nullable: false,
            unique: true,
            autoIncrement: true,
            roles: { primaryKey: true },
          },
          {
            id: 'p_name',
            name: 'name',
            dataType: 'varchar',
            nullable: false,
            unique: false,
          },
        ],
      },
    ],
  };
}

function seedUsers(db: Database.Database) {
  db.prepare("INSERT INTO users (email) VALUES ('a@b.com')").run();
  db.prepare("INSERT INTO users (email) VALUES ('c@d.com')").run();
}

describe('sandbox drift sync', () => {
  it('provisions a fresh sandbox and reports every table as created', () => {
    const db = new Database(':memory:');
    const report = provisionSandbox(db, baseModel());
    expect(report).toEqual([
      { table: 'users', action: 'created' },
      { table: 'products', action: 'created' },
    ]);
    db.close();
  });

  it('leaves an untouched table alone and preserves its data', () => {
    const db = new Database(':memory:');
    provisionSandbox(db, baseModel());
    seedUsers(db);

    const newModel = baseModel();
    // Only products changes — add a column.
    newModel.tables[1].columns.push({
      id: 'p_price',
      name: 'price',
      dataType: 'decimal',
      nullable: true,
      unique: false,
    });

    const report = syncSandbox(db, baseModel(), newModel);
    expect(report).toEqual(
      expect.arrayContaining([
        { table: 'users', action: 'unchanged' },
        { table: 'products', action: 'migrated' },
      ]),
    );

    const users = db.prepare('SELECT * FROM users').all();
    expect(users).toHaveLength(2); // untouched table's data survived

    db.close();
  });

  it('migrates a changed table while carrying over data for matching columns', () => {
    const db = new Database(':memory:');
    provisionSandbox(db, baseModel());
    db.prepare("INSERT INTO products (name) VALUES ('Widget')").run();

    const newModel = baseModel();
    newModel.tables[1].columns.push({
      id: 'p_price',
      name: 'price',
      dataType: 'decimal',
      nullable: true,
      unique: false,
      defaultValue: '0',
    });

    syncSandbox(db, baseModel(), newModel);

    const rows = db.prepare('SELECT * FROM products').all() as {
      name: string;
      price: number | null;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Widget'); // carried over from before the rebuild
    db.close();
  });

  it('creates a brand-new table added to the model', () => {
    const db = new Database(':memory:');
    provisionSandbox(db, baseModel());

    const newModel = baseModel();
    newModel.tables.push({
      id: 't_orders',
      name: 'orders',
      columns: [
        {
          id: 'o_id',
          name: 'id',
          dataType: 'integer',
          nullable: false,
          unique: true,
          autoIncrement: true,
          roles: { primaryKey: true },
        },
      ],
    });

    const report = syncSandbox(db, baseModel(), newModel);
    expect(report).toContainEqual({ table: 'orders', action: 'created' });
    expect(() => db.prepare('SELECT * FROM orders').all()).not.toThrow();
    db.close();
  });

  it('drops a table removed from the model', () => {
    const db = new Database(':memory:');
    provisionSandbox(db, baseModel());

    const newModel = baseModel();
    newModel.tables = newModel.tables.filter((t) => t.name !== 'products');

    const report = syncSandbox(db, baseModel(), newModel);
    expect(report).toContainEqual({ table: 'products', action: 'dropped' });
    expect(() => db.prepare('SELECT * FROM products').all()).toThrow();
    db.close();
  });

  it('falls back to wiping only the affected table when old rows cannot satisfy a new NOT NULL column', () => {
    const db = new Database(':memory:');
    provisionSandbox(db, baseModel());
    seedUsers(db);
    db.prepare("INSERT INTO products (name) VALUES ('Widget')").run();

    const newModel = baseModel();
    // A new NOT NULL column with no default: the rebuild's INSERT...SELECT
    // only carries over matching old columns, so this column is left
    // unpopulated for existing rows — SQLite rejects that, forcing the
    // fallback. The new table shape itself is valid, so the fallback
    // recreate (empty, no data copy) succeeds.
    newModel.tables[1].columns.push({
      id: 'p_sku',
      name: 'sku',
      dataType: 'varchar',
      nullable: false,
      unique: false,
    });

    const report = syncSandbox(db, baseModel(), newModel);
    const productsEntry = report.find((r) => r.table === 'products');
    expect(productsEntry?.action).toBe('reset');
    expect(productsEntry?.reason).toBeTruthy();

    // The table still exists (recreated empty, new column included) and
    // other tables are completely untouched.
    const productRows = db.prepare('SELECT * FROM products').all();
    expect(productRows).toHaveLength(0);
    expect(() =>
      db
        .prepare('INSERT INTO products (name, sku) VALUES (?, ?)')
        .run('Gadget', 'SKU-1'),
    ).not.toThrow();
    expect(db.prepare('SELECT * FROM users').all()).toHaveLength(2);

    db.close();
  });

  it('never lets a doubly-broken table definition crash the whole sync', () => {
    const db = new Database(':memory:');
    provisionSandbox(db, baseModel());

    const newModel = baseModel();
    // Duplicate column names — invalid even as a fresh CREATE TABLE, so both
    // the rebuild AND its recreate-empty fallback fail. The table should end
    // up absent rather than the sync throwing and aborting everything else.
    newModel.tables[1].columns = [
      newModel.tables[1].columns[0],
      {
        id: 'p_name',
        name: 'id',
        dataType: 'varchar',
        nullable: false,
        unique: false,
      },
    ];

    let report: ReturnType<typeof syncSandbox> = [];
    expect(() => {
      report = syncSandbox(db, baseModel(), newModel);
    }).not.toThrow();

    const productsEntry = report.find((r) => r.table === 'products');
    expect(productsEntry?.action).toBe('reset');
    expect(productsEntry?.reason).toContain('recreate also failed');
    expect(() => db.prepare('SELECT * FROM users').all()).not.toThrow();

    db.close();
  });
});
