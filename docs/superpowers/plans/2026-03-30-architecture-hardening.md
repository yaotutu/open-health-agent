# Architecture Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate schema dual definition, complete database indexes, add JSON field safety, and strengthen error handling.

**Architecture:** Migrate from raw SQL table creation to Drizzle Kit managed migrations. Add a `safeJsonParse` utility to protect all JSON field parsing. All changes are infrastructure-only, no business logic changes.

**Tech Stack:** Drizzle ORM, Drizzle Kit, Bun test runner, SQLite

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/store/json-utils.ts` | Create | safeJsonParse / safeJsonStringify utilities |
| `src/store/json-utils.test.ts` | Create | Unit tests for json-utils |
| `src/store/schema.ts` | Modify | Add indexes to all tables, add logs table |
| `src/store/db.ts` | Modify | Register heartbeatTasks + logs in Drizzle schema |
| `drizzle.config.ts` | Create | Drizzle Kit configuration |
| `src/store/index.ts` | Modify | Remove initTables(), add migrate() |
| `package.json` | Modify | Add db:* scripts |
| `src/prompts/assembler.ts` | Modify | Use safeJsonParse |
| `src/features/profile/tools.ts` | Modify | Use safeJsonParse / safeJsonStringify |
| `src/features/chronic/tools.ts` | Modify | Use safeJsonParse |
| `src/features/chronic/store.ts` | Modify | Use safeJsonStringify |
| `src/features/observation/tools.ts` | Modify | Use safeJsonParse |
| `src/features/observation/store.ts` | Modify | Use safeJsonStringify |

---

### Task 1: Create safeJson utility + tests

**Files:**
- Create: `src/store/json-utils.ts`
- Create: `src/store/json-utils.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// src/store/json-utils.test.ts
import { describe, test, expect } from 'bun:test';
import { safeJsonParse, safeJsonStringify } from './json-utils';

describe('safeJsonParse', () => {
  test('parses valid JSON string', () => {
    expect(safeJsonParse('["a","b"]', [])).toEqual(['a', 'b']);
  });

  test('returns fallback for null input', () => {
    expect(safeJsonParse(null, [])).toEqual([]);
  });

  test('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', [])).toEqual([]);
  });

  test('returns fallback for malformed JSON', () => {
    expect(safeJsonParse('{broken', {})).toEqual({});
  });

  test('parses object correctly', () => {
    expect(safeJsonParse('{"key":"value"}', {})).toEqual({ key: 'value' });
  });
});

describe('safeJsonStringify', () => {
  test('stringifies arrays', () => {
    expect(safeJsonStringify(['a', 'b'])).toBe('["a","b"]');
  });

  test('stringifies null to "null"', () => {
    expect(safeJsonStringify(null)).toBe('null');
  });

  test('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    // Should not throw, returns a fallback string
    const result = safeJsonStringify(obj);
    expect(typeof result).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/json-utils.test.ts`
Expected: FAIL — module `./json-utils` not found

- [ ] **Step 3: Write implementation**

```typescript
// src/store/json-utils.ts

/**
 * 安全解析 JSON 字符串
 * 当输入为 null 或解析失败时返回 fallback 值，避免 JSON.parse 导致的运行时崩溃
 * 用于数据库中 JSON 文本字段（diseases、allergies、tags、triggers）的反序列化
 * @param text 待解析的 JSON 字符串，可能为 null
 * @param fallback 解析失败时的默认返回值
 * @returns 解析结果或 fallback
 */
export function safeJsonParse<T>(text: string | null, fallback: T): T {
  if (text === null || text === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * 安全序列化为 JSON 字符串
 * 处理循环引用等边界情况，避免 JSON.stringify 抛出异常
 * @param value 待序列化的值
 * @returns JSON 字符串，序列化失败时返回 "null"
 */
export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'null';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/json-utils.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/json-utils.ts src/store/json-utils.test.ts
git commit -m "feat: add safeJsonParse/safeJsonStringify utilities"
```

---

### Task 2: Update schema.ts — Add indexes and logs table

**Files:**
- Modify: `src/store/schema.ts`

This task makes schema.ts the single source of truth for all indexes and adds the missing `logs` table.

- [ ] **Step 1: Add indexes to all record tables**

For each table that currently lacks an index, add a third argument (callback) to `sqliteTable()` defining the `userId` index. Follow the pattern already used by `memories` and `conversationSummaries`.

Tables to update (add `(table) => [index('name').on(table.userId)]` as third arg):

- `bodyRecords` → index `'idx_body_user_id'`
- `dietRecords` → index `'idx_diet_user_id'`
- `symptomRecords` → index `'idx_symptom_user_id'`
- `exerciseRecords` → index `'idx_exercise_user_id'`
- `sleepRecords` → index `'idx_sleep_user_id'`
- `waterRecords` → index `'idx_water_user_id'`
- `medicationRecords` → index `'idx_medication_user_id'`
- `chronicConditions` → index `'idx_chronic_user_id'`
- `healthObservations` → index `'idx_observation_user_id'`
- `messages` → index `'idx_messages_user_id'`

Example for `bodyRecords`:
```typescript
export const bodyRecords = sqliteTable('body_records', {
  // ... columns unchanged ...
}, (table) => [
  index('idx_body_user_id').on(table.userId),
]);
```

- [ ] **Step 2: Add logs table definition**

Add before the type exports, after `heartbeatTasks`:

```typescript
/**
 * 应用日志表
 * 存储应用运行日志（info 及以上级别），写入数据库而非控制台输出
 */
export const logs = sqliteTable('logs', {
  /** 日志ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 日志级别数值 */
  level: integer('level').notNull(),
  /** 日志级别名称（info/warn/error） */
  levelName: text('level_name').notNull(),
  /** 日志消息 */
  msg: text('msg').notNull(),
  /** 日志时间（ISO 格式字符串） */
  time: text('time').notNull(),
  /** 附加数据 JSON */
  data: text('data'),
  /** 模块名 */
  module: text('module'),
}, (table) => [
  index('idx_logs_time').on(table.time),
  index('idx_logs_module').on(table.module),
  index('idx_logs_level').on(table.level),
]);

/** 日志查询结果类型 */
export type LogRecord = typeof logs.$inferSelect;
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add src/store/schema.ts
git commit -m "feat: add indexes to all tables and logs table to schema.ts"
```

---

### Task 3: Update db.ts — Register heartbeatTasks and logs

**Files:**
- Modify: `src/store/db.ts`

- [ ] **Step 1: Import and register missing tables**

Add `heartbeatTasks` and `logs` imports from `./schema`:

```typescript
import {
  // ... existing imports ...
  heartbeatTasks,   // 心跳任务表
  logs              // 应用日志表
} from './schema';
```

Add to the schema object in `drizzle()`:
```typescript
schema: {
  // ... existing entries ...
  heartbeatTasks,
  logs,
}
```

Add to the generic type parameter of `CreateDbResult`:
```typescript
heartbeatTasks: typeof heartbeatTasks;
logs: typeof logs;
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/db.ts
git commit -m "feat: register heartbeatTasks and logs in Drizzle schema"
```

---

### Task 4: Create drizzle.config.ts + update package.json

**Files:**
- Create: `drizzle.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Create drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/store/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH || './data/healthclaw.db',
  },
});
```

- [ ] **Step 2: Add scripts to package.json**

Add to `scripts`:
```json
"db:generate": "drizzle-kit generate",
"db:push": "drizzle-kit push",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 3: Verify drizzle-kit push works**

Run: `bun drizzle-kit push`
Expected: Command runs and shows the diff between current DB and schema. Tables should already exist, only new indexes and the logs table (if not present) will be created.

- [ ] **Step 4: Commit**

```bash
git add drizzle.config.ts package.json
git commit -m "feat: add Drizzle Kit config and db scripts"
```

---

### Task 5: Refactor store/index.ts — Remove initTables(), add migration

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Replace initTables() with migrate()**

Remove the entire `initTables()` method (lines ~182-410 of raw SQL).

Replace constructor body with migration-based initialization:

```typescript
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { logger } from '../infrastructure/logger';

// ... in constructor:
constructor(dbPath: string) {
  const { db, sqlite } = createDb(dbPath);
  this.db = db;
  this.sqlite = sqlite;

  // 使用 Drizzle 迁移管理表结构（替代原来的 raw SQL initTables）
  migrate(db, { migrationsFolder: './drizzle' });
  logger.info('[store] database migrated');

  // 初始化各存储模块（顺序无关，Drizzle 已确保表存在）
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
```

Note: `logs` no longer needs to be created after `initTables()` since migration ensures the table exists before any store is initialized.

- [ ] **Step 2: Generate initial migration**

Run: `bun drizzle-kit generate`
Expected: Creates migration SQL files in `./drizzle/` directory.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Verify server starts**

Run: `bun run server` (start and stop with Ctrl+C)
Expected: Server starts without errors, logs show `[store] database migrated`

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts drizzle/
git commit -m "refactor: replace raw SQL initTables with Drizzle migration"
```

---

### Task 6: Replace unsafe JSON.parse in assembler.ts

**Files:**
- Modify: `src/prompts/assembler.ts`

- [ ] **Step 1: Import and apply safeJsonParse**

Add import at top:
```typescript
import { safeJsonParse } from '../store/json-utils';
```

Replace `formatProfile` (line 71-74):
```typescript
// Before:
diseases: profile.diseases ? JSON.parse(profile.diseases) : [],
allergies: profile.allergies ? JSON.parse(profile.allergies) : [],

// After:
diseases: safeJsonParse(profile.diseases, []),
allergies: safeJsonParse(profile.allergies, []),
```

Replace in `formatRecentRecords` observations section (line 166):
```typescript
// Before:
const tags = r.tags ? JSON.parse(r.tags) as string[] : [];

// After:
const tags = safeJsonParse<string[]>(r.tags, []);
```

Replace in `formatChronicConditions` (line 208):
```typescript
// Before:
const triggers = c.triggers ? JSON.parse(c.triggers) as string[] : [];

// After:
const triggers = safeJsonParse<string[]>(c.triggers, []);
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/prompts/assembler.ts
git commit -m "fix: use safeJsonParse in assembler for JSON field parsing"
```

---

### Task 7: Replace unsafe JSON.parse/stringify in feature stores and tools

**Files:**
- Modify: `src/features/profile/tools.ts`
- Modify: `src/features/chronic/tools.ts`
- Modify: `src/features/chronic/store.ts`
- Modify: `src/features/observation/tools.ts`
- Modify: `src/features/observation/store.ts`

- [ ] **Step 1: Update profile/tools.ts**

Add import:
```typescript
import { safeJsonParse, safeJsonStringify } from '../../store/json-utils';
```

Replace `getProfile` tool (lines 66-67):
```typescript
// Before:
diseases: profile.diseases ? JSON.parse(profile.diseases) as string[] : [],
allergies: profile.allergies ? JSON.parse(profile.allergies) as string[] : [],

// After:
diseases: safeJsonParse<string[]>(profile.diseases, []),
allergies: safeJsonParse<string[]>(profile.allergies, []),
```

Replace `updateProfile` tool (lines 94-95):
```typescript
// Before:
if (params.diseases !== undefined) data.diseases = JSON.stringify(params.diseases);
if (params.allergies !== undefined) data.allergies = JSON.stringify(params.allergies);

// After:
if (params.diseases !== undefined) data.diseases = safeJsonStringify(params.diseases);
if (params.allergies !== undefined) data.allergies = safeJsonStringify(params.allergies);
```

- [ ] **Step 2: Update chronic/tools.ts**

Add import:
```typescript
import { safeJsonParse } from '../../store/json-utils';
```

Replace `queryChronicConditions` tool (line 131):
```typescript
// Before:
triggers: r.triggers ? JSON.parse(r.triggers) : [],

// After:
triggers: safeJsonParse<string[]>(r.triggers, []),
```

- [ ] **Step 3: Update chronic/store.ts**

Add import:
```typescript
import { safeJsonStringify } from '../../store/json-utils';
```

Replace `add` method (line 52):
```typescript
// Before:
triggers: data.triggers ? JSON.stringify(data.triggers) : null,

// After:
triggers: data.triggers ? safeJsonStringify(data.triggers) : null,
```

Replace `update` method (line 79):
```typescript
// Before:
if (data.triggers !== undefined) updateData.triggers = JSON.stringify(data.triggers);

// After:
if (data.triggers !== undefined) updateData.triggers = safeJsonStringify(data.triggers);
```

- [ ] **Step 4: Update observation/tools.ts**

Add import:
```typescript
import { safeJsonParse } from '../../store/json-utils';
```

Replace `queryObservations` tool (line 83):
```typescript
// Before:
tags: r.tags ? JSON.parse(r.tags) : [],

// After:
tags: safeJsonParse<string[]>(r.tags, []),
```

- [ ] **Step 5: Update observation/store.ts**

Add import:
```typescript
import { safeJsonStringify } from '../../store/json-utils';
```

Replace `mapRecord` (line 33):
```typescript
// Before:
tags: data.tags ? JSON.stringify(data.tags) : null,

// After:
tags: data.tags ? safeJsonStringify(data.tags) : null,
```

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Verify server starts**

Run: `bun run server` (start and stop with Ctrl+C)
Expected: Server starts without errors

- [ ] **Step 8: Commit**

```bash
git add src/features/profile/tools.ts src/features/chronic/tools.ts src/features/chronic/store.ts src/features/observation/tools.ts src/features/observation/store.ts
git commit -m "fix: replace unsafe JSON.parse/stringify with safeJson utilities"
```

---

## Execution Notes

- **Task 1** is independent and can run first
- **Tasks 2-3** can run in parallel (both modify different files)
- **Task 4** depends on Tasks 2-3 being done
- **Task 5** depends on Task 4 being done
- **Tasks 6-7** depend on Task 1 but are independent of Tasks 2-5

Recommended order: 1 → (2+3 parallel) → 4 → 5 → (6+7 parallel)
