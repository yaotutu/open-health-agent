import { createDb, type Db } from './db';
import { createBodyStore, type BodyStore } from '../features/body/store';
import { createDietStore, type DietStore } from '../features/diet/store';
import { createExerciseStore, type ExerciseStore } from '../features/exercise/store';
import { createMessageStore, type MessageStore } from './messages';
import { createProfileStore, type ProfileStore } from '../features/profile/store';
import { createSleepStore, type SleepStore } from '../features/sleep/store';
import { createSymptomStore, type SymptomStore } from '../features/symptom/store';
import { createWaterStore, type WaterStore } from '../features/water/store';
import { createMemoryStore, type MemoryStore } from '../features/memory/store';
import { createSummaryStore, type SummaryStore } from './summary';
import { createLogStore, type LogStore } from './logs';
import { createMedicationStore, type MedicationStore } from '../features/medication/store';
import { createChronicStore, type ChronicStore } from '../features/chronic/store';
import { createObservationStore, type ObservationStore } from '../features/observation/store';
import { createHeartbeatTaskStore, type HeartbeatTaskStore } from '../features/heartbeat/store';
import {
  userProfiles,
  bodyRecords,
  dietRecords,
  symptomRecords,
  exerciseRecords,
  sleepRecords,
  waterRecords,
  messages,
  memories,
  conversationSummaries,
  medicationRecords,
  chronicConditions,
  healthObservations,
  type Message,
  type UserProfile,
  type MemoryRecord,
  type ConversationSummary,
  type MedicationRecord,
  type ChronicCondition,
  type HealthObservation,
} from './schema';
import type { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
// Drizzle 迁移工具：用于从 SQL 文件自动建表/改表，替代手写 initTables
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
// 结构化日志，记录迁移完成等事件
import { logger } from '../infrastructure/logger';

/**
 * 为已有数据库填充 Drizzle 迁移日志
 *
 * 当数据库是由旧版 initTables() 创建的（没有 __drizzle_migrations 表），
 * 直接调用 migrate() 会因 CREATE TABLE 失败（表已存在）。
 * 此函数读取迁移文件，计算哈希并插入迁移日志，使 migrate() 跳过已应用的迁移。
 * @param sqlite 底层 SQLite 连接
 * @param migrationsFolder 迁移文件目录路径
 */
function seedMigrationJournal(sqlite: Database, migrationsFolder: string): void {
  // 创建迁移跟踪表（与 Drizzle 内部使用的结构一致）
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    )
  `);

  // 读取迁移日志，获取所有迁移条目的 tag 和时间戳
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));

  for (const entry of journal.entries) {
    // 读取迁移 SQL 文件内容并计算 SHA-256 哈希
    const sqlPath = join(migrationsFolder, `${entry.tag}.sql`);
    const sqlContent = readFileSync(sqlPath, 'utf-8');
    const hash = createHash('sha256').update(sqlContent).digest('hex');

    // 将该迁移标记为已应用，migrate() 会跳过它
    sqlite.run(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      [hash, entry.when]
    );
  }

  logger.info('[store] seeded migration journal for existing database');
}

// 导出所有存储创建函数
export {
  createDb,
  createBodyStore,
  createDietStore,
  createExerciseStore,
  createMessageStore,
  createProfileStore,
  createSleepStore,
  createSymptomStore,
  createWaterStore,
  createMemoryStore,
  createSummaryStore,
  createLogStore,
  createMedicationStore,
  createChronicStore,
  createObservationStore,
  createHeartbeatTaskStore,
};

// 导出所有 schema 表
export {
  userProfiles,
  bodyRecords,
  dietRecords,
  symptomRecords,
  exerciseRecords,
  sleepRecords,
  waterRecords,
  messages,
  memories,
  conversationSummaries,
  medicationRecords,
  chronicConditions,
  healthObservations,
};

// 导出所有类型
export type {
  Db,
  BodyStore,
  DietStore,
  ExerciseStore,
  MessageStore,
  ProfileStore,
  SleepStore,
  SymptomStore,
  WaterStore,
  MemoryStore,
  SummaryStore,
  LogStore,
  MedicationStore,
  ChronicStore,
  ObservationStore,
  HeartbeatTaskStore,
  Message,
  UserProfile,
  MemoryRecord,
  ConversationSummary,
  MedicationRecord,
  ChronicCondition,
  HealthObservation,
};

// 统一的 Store 类，管理所有存储模块和数据库初始化
export class Store {
  readonly db: Db;
  readonly sqlite: Database;

  // 各类型健康数据存储
  readonly body: BodyStore;
  readonly diet: DietStore;
  readonly exercise: ExerciseStore;
  readonly sleep: SleepStore;
  readonly symptom: SymptomStore;
  readonly water: WaterStore;

  readonly messages: MessageStore;
  readonly profile: ProfileStore;

  // 记忆和对话摘要存储
  readonly memory: MemoryStore;
  readonly summary: SummaryStore;

  // 日志存储（写入数据库，不输出到控制台）
  readonly logs: LogStore;

  // 用药记录存储
  readonly medication: MedicationStore;

  // 慢性病记录存储
  readonly chronic: ChronicStore;

  // 健康观察记录存储
  readonly observation: ObservationStore;

  // 心跳任务存储
  readonly heartbeatTask: HeartbeatTaskStore;

  constructor(dbPath: string) {
    const { db, sqlite } = createDb(dbPath);
    this.db = db;
    this.sqlite = sqlite;

    // 使用 Drizzle 迁移管理表结构（替代原来的 raw SQL initTables）
    // 从 ./drizzle 目录读取迁移 SQL 文件，自动建表和创建索引

    // 兼容旧版数据库：旧版由 initTables() 创建，没有 __drizzle_migrations 表
    // 需要先填充迁移日志，否则 migrate() 会因表已存在而失败
    const migrationsFolder = './drizzle';
    const hasExistingTables = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='body_records'"
    ).get();
    const hasMigrationsTable = sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
    ).get();

    if (hasExistingTables && !hasMigrationsTable) {
      seedMigrationJournal(sqlite, migrationsFolder);
    }

    migrate(db, { migrationsFolder });
    logger.info('[store] database migrated');

    // 初始化各存储模块（Drizzle 迁移已确保表存在，初始化顺序无关）
    this.body = createBodyStore(this.db);
    this.diet = createDietStore(this.db);
    this.exercise = createExerciseStore(this.db);
    this.sleep = createSleepStore(this.db);
    this.symptom = createSymptomStore(this.db);
    this.water = createWaterStore(this.db);
    this.messages = createMessageStore(this.db);
    this.profile = createProfileStore(this.db);
    this.memory = createMemoryStore(this.db);
    this.summary = createSummaryStore(this.db);
    this.logs = createLogStore(this.sqlite);
    this.medication = createMedicationStore(this.db);
    this.chronic = createChronicStore(this.db);
    this.observation = createObservationStore(this.db);
    this.heartbeatTask = createHeartbeatTaskStore(this.sqlite);
  }

  /** 关闭数据库连接 */
  close(): void {
    this.sqlite.close();
  }
}
