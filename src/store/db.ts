import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { healthRecords, messages } from './schema';

export interface CreateDbResult {
  db: ReturnType<typeof drizzle<{ healthRecords: typeof healthRecords; messages: typeof messages }>>;
  sqlite: Database;
}

export const createDb = (dbPath: string): CreateDbResult => {
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema: { healthRecords, messages } });
  return { db, sqlite };
};

export type Db = CreateDbResult['db'];
