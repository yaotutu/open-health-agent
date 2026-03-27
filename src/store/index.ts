import { createDb, type Db } from './db';
import { createHealthStore, type HealthStore } from './health';
import { createMessageStore, type MessageStore } from './messages';
import { healthRecords, messages } from './schema';
import type { Database } from 'bun:sqlite';

export { createDb, createHealthStore, createMessageStore };
export { healthRecords, messages };
export type { Db, HealthStore, MessageStore };

export type HealthRecord = typeof healthRecords.$inferSelect;
export type Message = typeof messages.$inferSelect;

// 统一的 Store 类
export class Store {
  readonly db: Db;
  readonly sqlite: Database;
  readonly health: HealthStore;
  readonly messages: MessageStore;

  constructor(dbPath: string) {
    const { db, sqlite } = createDb(dbPath);
    this.db = db;
    this.sqlite = sqlite;
    this.health = createHealthStore(this.db);
    this.messages = createMessageStore(this.db);
    this.initTables();
  }

  private initTables(): void {
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('weight', 'sleep', 'diet', 'exercise', 'water')),
        value REAL NOT NULL,
        unit TEXT,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_health_user_id ON health_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_records(timestamp)`);
  }

  close(): void {
    this.sqlite.close();
  }
}
