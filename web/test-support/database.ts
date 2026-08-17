import { readFile } from 'node:fs/promises';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

import type { Database, Statement } from '../src/lib/server/database';

const MIGRATIONS = [
  '../migrations/0001_site_config.sql',
  '../migrations/0002_admin_groups.sql',
  '../migrations/0003_admin_participants.sql'
];

class TestStatement implements Statement {
  private values: unknown[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]): Statement {
    this.values = values;
    return this;
  }

  async first<Row>(column?: string): Promise<Row | null> {
    const row = this.statement.get(...(this.values as never[])) as Record<string, unknown>;
    if (!row) return null;
    return (column ? row[column] : row) as Row;
  }

  async all<Row>(): Promise<{ results: Row[] }> {
    return { results: this.statement.all(...(this.values as never[])) as Row[] };
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const result = this.statement.run(...(this.values as never[]));
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid)
      }
    };
  }
}

export interface TestDatabase extends Database {
  exec(sql: string): Promise<void>;
  close(): void;
}

/** An in-memory SQLite database wearing D1's interface, for tests. */
export function createTestDatabase(): TestDatabase {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  return {
    prepare: (sql: string) => new TestStatement(sqlite.prepare(sql)),
    exec: async (sql: string) => sqlite.exec(sql),
    close: () => sqlite.close()
  };
}

/** Apply the real migrations, so tests run against the shipped schema. */
export async function applyMigrations(database: TestDatabase): Promise<void> {
  for (const migration of MIGRATIONS) {
    await applyMigration(database, migration);
  }
}

/**
 * Apply one migration by path, so a test can stand the schema up as it was
 * before a later one and check what that later one does to existing rows.
 */
export async function applyMigration(database: TestDatabase, migration: string): Promise<void> {
  await database.exec(await readFile(new URL(migration, import.meta.url), 'utf8'));
}
