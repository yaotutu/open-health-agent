# Feature-Based Architecture Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Healthclaw from layer-based to feature-based architecture for better maintainability and extensibility.

**Architecture:** Move each feature's store, tools, and prompts into a dedicated `src/features/<name>/` folder. The Store class remains a unified facade, importing from features. Analysis code is deleted — LLM does analysis via raw data queries + prompts.

**Tech Stack:** TypeScript, Bun, Drizzle ORM, @sinclair/typebox, pi-agent-core

**Verification:** Run `bun run typecheck` after every task. All types must pass.

---

## Phase 1: Foundation

### Task 1: Create config.ts

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Create config.ts**

```typescript
/**
 * 集中管理所有环境变量配置
 * 提供统一的配置读取入口，替代各模块直接读取 process.env
 */
export const config = {
  /** 服务器端口 */
  port: Number(process.env.PORT) || 3001,
  /** 数据库文件路径 */
  dbPath: process.env.DB_PATH || './data/healthclaw.db',
  /** 测试模式：不加载历史消息，不生成对话摘要 */
  testMode: process.env.TEST_MODE === '1',
  /** 优雅关闭超时时间（毫秒） */
  shutdownTimeout: 10000,

  /** LLM 配置 */
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-6',
  },

  /** QQ Bot 配置（可选） */
  qq: {
    appId: process.env.QQBOT_APP_ID,
    appSecret: process.env.QQBOT_APP_SECRET,
    clientSecret: process.env.QQBOT_CLIENT_SECRET || process.env.QQBOT_APP_SECRET,
  },

  /** 日志配置 */
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
```

- [ ] **Step 2: Update main.ts to use config**

Replace the env var reads in `src/main.ts`:

```
Old: const PORT = parseInt(process.env.PORT || '3001', 10);
New: (remove this line, use config.port)

Old: const DB_PATH = process.env.DB_PATH || './data/healthclaw.db';
New: (remove this line, use config.dbPath)

Old: const SHUTDOWN_TIMEOUT = 10000;
New: (remove this line, use config.shutdownTimeout)

Old: const TEST_MODE = process.env.TEST_MODE === '1';
New: (remove this line, use config.testMode)
```

Then update all references in main.ts:
- `DB_PATH` → `config.dbPath`
- `PORT` → `config.port`
- `SHUTDOWN_TIMEOUT` → `config.shutdownTimeout`
- `TEST_MODE` → `config.testMode`
- `process.env.QQBOT_APP_ID` → `config.qq.appId`
- `process.env.QQBOT_APP_SECRET` → `config.qq.appSecret`
- `process.env.QQBOT_CLIENT_SECRET` → `config.qq.clientSecret`

Add import: `import { config } from './config';`

- [ ] **Step 3: Update agent/factory.ts to use config**

Replace:
```
Old: const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
Old: const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';
```

With:
```
import { config } from '../config';
// Remove the two const lines, use config.llm.provider and config.llm.model
```

Update all references in factory.ts:
- `LLM_PROVIDER` → `config.llm.provider`
- `LLM_MODEL` → `config.llm.model`

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors)

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/main.ts src/agent/factory.ts
git commit -m "refactor: add config.ts for centralized env var management"
```

---

### Task 2: Fix db.ts schema exports

**Files:**
- Modify: `src/store/db.ts`

- [ ] **Step 1: Add missing schema imports and registrations**

In `src/store/db.ts`, add to the import from `./schema`:
```
  medicationRecords,
  chronicConditions,
  healthObservations,
```

Add to the `CreateDbResult` interface's db type parameter:
```
    medicationRecords: typeof medicationRecords;
    chronicConditions: typeof chronicConditions;
    healthObservations: typeof healthObservations;
```

Add to the `drizzle(sqlite, { schema: { ... } })` call:
```
      medicationRecords,
      chronicConditions,
      healthObservations,
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/db.ts
git commit -m "fix: add missing table schemas to db.ts for Drizzle Kit support"
```

---

## Phase 2: Feature Migration

Each feature migration follows the same pattern. The first one (water) is detailed; subsequent ones reference this pattern.

**Migration pattern for each feature:**
1. Create `src/features/<name>/` directory
2. Move `src/store/<name>.ts` → `src/features/<name>/store.ts` (update imports)
3. Extract tools from `src/agent/tools.ts` → `src/features/<name>/tools.ts` (update imports)
4. Move `src/prompts/capabilities/<name>.md` → `src/features/<name>/prompt.md`
5. Update `src/store/index.ts` Store class: import from new location
6. Run `bun run typecheck`

### Task 3: Migrate water feature (template)

**Files:**
- Create: `src/features/water/store.ts`
- Create: `src/features/water/tools.ts`
- Move: `src/prompts/capabilities/record-water.md` → `src/features/water/prompt.md`
- Modify: `src/store/index.ts`
- Modify: `src/agent/tools.ts`
- Delete: `src/store/water.ts`

- [ ] **Step 1: Create features/water directory and store.ts**

```bash
mkdir -p src/features/water
```

Create `src/features/water/store.ts`:
```typescript
/**
 * 饮水记录存储模块
 * 从 src/store/water.ts 迁移至此，属于饮水功能域
 */
import type { Db } from '../../store/db';
import { waterRecords, type WaterRecord } from '../../store/schema';
import { createRecordStore, type QueryOptions } from '../../store/record-store';

/**
 * 饮水记录的数据接口
 * 用于工具层传入数据，不含 userId 和 id
 */
export interface WaterRecordData {
  amount: number;
  note?: string;
  timestamp?: number;
}

/**
 * 创建饮水记录存储模块
 * 提供饮水量数据的记录和查询功能
 * @param db Drizzle ORM 数据库实例
 */
export const createWaterStore = (db: Db) => {
  const store = createRecordStore({
    db,
    table: waterRecords,
    label: 'water',
    mapRecord: (userId, data: WaterRecordData, now) => ({
      userId,
      amount: data.amount,
      note: data.note,
      timestamp: data.timestamp ?? now,
    }),
  });

  return store;
};

export type WaterStore = ReturnType<typeof createWaterStore>;
```

- [ ] **Step 2: Create features/water/tools.ts**

```typescript
/**
 * 饮水功能的 Agent 工具
 * 从 src/agent/tools.ts 中提取的饮水相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { WaterStore } from './store';
import { createQueryTool } from '../../agent/tool-factory';

/** 记录饮水的参数 Schema */
const RecordWaterParamsSchema = Type.Object({
  amount: Type.Number({ description: '饮水量 ml' }),
  note: Type.Optional(Type.String({ description: '备注' })),
});

type RecordWaterParams = typeof RecordWaterParamsSchema;

/**
 * 创建饮水功能的 Agent 工具集
 * @param store 饮水存储实例
 * @param userId 当前用户 ID
 */
export const createWaterTools = (store: WaterStore, userId: string) => {
  /** 记录饮水工具 */
  const recordWater: AgentTool<RecordWaterParams> = {
    name: 'record_water',
    label: '记录饮水',
    description: '记录用户的饮水量（ml）',
    parameters: RecordWaterParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.record(userId, {
        amount: params.amount,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录饮水: ${record.amount}ml` }],
        details: { id: record.id, record },
      };
    },
  };

  /** 查询饮水记录 */
  const queryWaterRecords = createQueryTool({
    name: 'query_water_records',
    label: '查询饮水记录',
    description: '查询用户的饮水记录，支持按时间范围筛选。',
    queryFn: (options) => store.query(userId, options),
  });

  return { recordWater, queryWaterRecords };
};
```

- [ ] **Step 3: Move prompt file**

```bash
mv src/prompts/capabilities/record-water.md src/features/water/prompt.md
```

- [ ] **Step 4: Update store/index.ts**

Change the import:
```
Old: import { createWaterStore, type WaterStore } from './water';
New: import { createWaterStore, type WaterStore } from '../features/water/store';
```

The rest of store/index.ts (Store class using `this.water = createWaterStore(this.db)`) stays the same.

- [ ] **Step 5: Remove water tools from agent/tools.ts**

Remove from `src/agent/tools.ts`:
- `RecordWaterParamsSchema` (lines 72-75)
- `RecordWaterParams` type (line 241)
- The `recordWater` tool definition (lines 424-440)
- The `queryWaterRecords` tool definition (lines 798-803)
- From the return object: `recordWater` and `queryWaterRecords`

Add import at top:
```
import { createWaterTools } from '../features/water/tools';
```

In `createTools`, add water tools via:
```typescript
const waterTools = createWaterTools(store.water, userId);
```

And in the return object, replace `recordWater` and `queryWaterRecords` with:
```typescript
recordWater: waterTools.recordWater,
queryWaterRecords: waterTools.queryWaterRecords,
```

- [ ] **Step 6: Update agent/factory.ts tool registration**

In `src/agent/factory.ts`, the tool list already references `tools.recordWater` and `tools.queryWaterRecords` — no change needed since the return object shape is preserved.

- [ ] **Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 8: Delete old store file and commit**

```bash
rm src/store/water.ts
git add -A
git commit -m "refactor: migrate water feature to features/water/"
```

---

### Task 4: Migrate body feature

Same pattern as Task 3.

**Files:**
- Create: `src/features/body/store.ts`
- Create: `src/features/body/tools.ts`
- Move: `src/prompts/capabilities/record-body.md` → `src/features/body/prompt.md`
- Modify: `src/store/index.ts` (import path)
- Modify: `src/agent/tools.ts` (remove body schemas/tools, add import)
- Delete: `src/store/body.ts`

- [ ] **Step 1: Create features/body/ files**

store.ts: Copy from `src/store/body.ts`, update imports to `../../store/db` and `../../store/schema`.
tools.ts: Extract `RecordBodyParamsSchema`, `recordBody` tool, `queryBodyRecords` from tools.ts. Use same pattern as water.

- [ ] **Step 2: Move prompt and update imports**

```bash
mkdir -p src/features/body
mv src/prompts/capabilities/record-body.md src/features/body/prompt.md
```

- [ ] **Step 3: Update store/index.ts import**

Change: `'./body'` → `'../features/body/store'`

- [ ] **Step 4: Update agent/tools.ts**

Remove body schemas/tools, add `import { createBodyTools } from '../features/body/tools'` pattern.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Delete old file and commit**

```bash
rm src/store/body.ts
git add -A
git commit -m "refactor: migrate body feature to features/body/"
```

---

### Task 5: Migrate sleep feature

Same pattern as Task 3. Note: sleep tool has `parseDateTime` helper — include it in tools.ts.

**Files:**
- Create: `src/features/sleep/store.ts`
- Create: `src/features/sleep/tools.ts` (include parseDateTime helper)
- Move: `src/prompts/capabilities/record-sleep.md` → `src/features/sleep/prompt.md`
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/sleep.ts`

- [ ] **Step 1-6: Same pattern as Task 3**

Run: `bun run typecheck` after each change.
Commit: `refactor: migrate sleep feature to features/sleep/`

---

### Task 6: Migrate exercise feature

Same pattern as Task 3.

**Files:**
- Create: `src/features/exercise/store.ts`
- Create: `src/features/exercise/tools.ts`
- Move: `src/prompts/capabilities/record-exercise.md` → `src/features/exercise/prompt.md`
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/exercise.ts`

- [ ] **Step 1-6: Same pattern as Task 3**

Run: `bun run typecheck` after each change.
Commit: `refactor: migrate exercise feature to features/exercise/`

---

### Task 7: Migrate observation feature

Same pattern as Task 3. Note: observation query tool has JSON parsing for tags.

**Files:**
- Create: `src/features/observation/store.ts`
- Create: `src/features/observation/tools.ts` (include tags JSON parsing in query tool)
- Move: `src/prompts/capabilities/record-observation.md` → `src/features/observation/prompt.md`
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/observation.ts`

- [ ] **Step 1-6: Same pattern as Task 3**

Run: `bun run typecheck` after each change.
Commit: `refactor: migrate observation feature to features/observation/`

---

### Task 8: Migrate diet feature

Same pattern as Task 3. Note: diet has more fields (food, calories, protein, carbs, fat, sodium, mealType).

**Files:**
- Create: `src/features/diet/store.ts`
- Create: `src/features/diet/tools.ts`
- Move: `src/prompts/capabilities/record-diet.md` → `src/features/diet/prompt.md`
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/diet.ts`

- [ ] **Step 1-6: Same pattern as Task 3**

Run: `bun run typecheck` after each change.
Commit: `refactor: migrate diet feature to features/diet/`

---

### Task 9: Migrate symptom feature

Note: symptom store is fully hand-written (record/query/resolve), not using createRecordStore. Keep it as-is, just move the file and update imports.

**Files:**
- Create: `src/features/symptom/store.ts` (move custom implementation, update imports)
- Create: `src/features/symptom/tools.ts` (record, query, resolve tools)
- Move: `src/prompts/capabilities/record-symptom.md` → `src/features/symptom/prompt.md`
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/symptom.ts`

- [ ] **Step 1: Create features/symptom/store.ts**

Based on `src/store/symptom.ts`. The store is fully hand-written with custom record/query/resolve methods. Move it as-is, only update imports: `'./db'` → `'../../store/db'`, `'./schema'` → `'../../store/schema'`, `'../infrastructure/logger'` → `'../../infrastructure/logger'`.

- [ ] **Step 2: Create features/symptom/tools.ts**

Extract: `RecordSymptomParamsSchema`, `ResolveSymptomParamsSchema`, `recordSymptom`, `querySymptomRecords`, `resolveSymptom`.

- [ ] **Step 3-6: Move prompt, update imports, verify, commit**

Run: `bun run typecheck`
Commit: `refactor: migrate symptom feature to features/symptom/`

---

### Task 10: Migrate medication feature

Note: medication store has `record/query/stop` with `activeOnly` filter. Keep as custom store (don't force createRecordStore — the `stop` and `activeOnly` query make it non-standard).

**Files:**
- Create: `src/features/medication/store.ts` (keep custom implementation, update imports)
- Create: `src/features/medication/tools.ts` (record, query, stop tools)
- Move: `src/prompts/capabilities/record-medication.md` → `src/features/medication/prompt.md`
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/medication.ts`

- [ ] **Step 1-6: Same pattern, custom store**

Run: `bun run typecheck`
Commit: `refactor: migrate medication feature to features/medication/`

---

### Task 11: Migrate chronic feature

Note: chronic store has completely different API shape (`add/update/query/deactivate`), no timestamp column. Keep as custom store.

**Files:**
- Create: `src/features/chronic/store.ts` (keep custom implementation, update imports)
- Create: `src/features/chronic/tools.ts` (record, update, query, deactivate tools)
- Move: `src/prompts/capabilities/chronic-management.md` → `src/features/chronic/prompt.md`
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/chronic.ts`

- [ ] **Step 1-6: Same pattern, custom store**

Run: `bun run typecheck`
Commit: `refactor: migrate chronic feature to features/chronic/`

---

### Task 12: Migrate memory feature

Note: memory store has `save/query/remove/getAll` — custom API.

**Files:**
- Create: `src/features/memory/store.ts` (keep custom implementation)
- Create: `src/features/memory/tools.ts` (save, query, delete tools)
- Create: `src/features/memory/prompt.md` (new — currently no dedicated prompt file; create minimal one)
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/memory.ts`

- [ ] **Step 1: Create features/memory/prompt.md**

```markdown
# 长期记忆

## 工具
- `save_memory` - 保存记忆
- `query_memories` - 查询记忆
- `delete_memory` - 删除记忆

## 使用时机
- 用户表达明确的偏好或习惯时（如"我不爱吃辣"、"我一般11点睡觉"）
- 用户给出关于自己健康的重要事实（如"我有乳糖不耐受"、"我对花生过敏"）
- 用户反馈建议效果（如"你推荐的拉伸很有用"、"那个方法没效果"）

## 注意事项
- 主动记忆：当用户无意中透露与健康相关的个人特征时，主动保存
- 不要记忆：一次性的抱怨、日常寒暄、已通过结构化记录保存的数据
- 分类标签：feedback(反馈)、preference(偏好)、fact(事实)
- 保存前用自然语言确认，不要说"我帮你保存了一条记忆"
```

- [ ] **Step 2-6: Same pattern, custom store**

Run: `bun run typecheck`
Commit: `refactor: migrate memory feature to features/memory/`

---

### Task 13: Migrate profile feature

Note: profile store has `get/upsert` — custom API.

**Files:**
- Create: `src/features/profile/store.ts` (keep custom implementation)
- Create: `src/features/profile/tools.ts` (get, update tools)
- Create: `src/features/profile/prompt.md` (new — create minimal one)
- Modify: `src/store/index.ts`, `src/agent/tools.ts`
- Delete: `src/store/profile.ts`

- [ ] **Step 1: Create features/profile/prompt.md**

```markdown
# 用户档案

## 工具
- `get_profile` - 获取用户档案
- `update_profile` - 更新用户档案

## 使用时机
- 首次对话时获取用户档案，了解基本情况
- 用户提到个人信息变化时更新档案（如年龄、身高、健康目标）

## 注意事项
- 体重不存储在档案中，使用 `record_body` 工具记录
- 所有字段都是可选的，只更新用户提到的字段
- 疾病史和过敏史是数组，更新时替换整个数组
```

- [ ] **Step 2-6: Same pattern, custom store**

Run: `bun run typecheck`
Commit: `refactor: migrate profile feature to features/profile/`

---

## Phase 3: Cleanup

### Task 14: Delete analysis module

**Files:**
- Delete: `src/store/analysis.ts`
- Delete: `src/prompts/capabilities/analysis.md`
- Modify: `src/store/index.ts` (remove analysis import and Store member)
- Modify: `src/agent/tools.ts` (remove analysis tool definitions)
- Modify: `src/agent/factory.ts` (remove analysis tools from tool list)

- [ ] **Step 1: Remove analysis from Store class**

In `src/store/index.ts`:
- Remove import: `import { createAnalysisStore, type AnalysisStore } from './analysis';`
- Remove from re-exports: `createAnalysisStore,`
- Remove from type exports: `AnalysisStore,`
- Remove member: `readonly analysis: AnalysisStore;`
- Remove constructor line: `this.analysis = createAnalysisStore(this);`

- [ ] **Step 2: Remove analysis tools from agent/tools.ts**

Remove:
- `QueryFoodSymptomCorrelationParamsSchema`
- `QueryHealthPatternsParamsSchema`
- Their type aliases
- `queryFoodSymptomCorrelation` tool
- `queryHealthPatterns` tool
- Both from the return object

- [ ] **Step 3: Remove analysis tools from factory.ts tool list**

In `src/agent/factory.ts`, remove:
```
    tools.queryFoodSymptomCorrelation,
    tools.queryHealthPatterns,
```

- [ ] **Step 4: Add analysis replacement rule to prompts/rules/**

Create `src/prompts/rules/analysis-guidance.md`:

```markdown
# 分析指导

## 食物-症状关联分析
当用户询问某食物是否可能引起不适时：
1. 使用 `query_diet_records` 查询用户饮食记录
2. 使用 `query_symptom_records` 查询症状记录
3. 对比症状出现前 2-4 小时内的饮食，找出常见食物
4. 如果同一种食物多次在症状前出现，提示可能的关联
5. 明确告知这只是数据上的时间关联，不构成医学诊断

## 健康模式分析
当用户询问整体健康状况或趋势时：
1. 综合查询睡眠、运动、症状、饮食等多维度数据
2. 注意睡眠不足（<6小时）与症状增多的关联
3. 注意运动量变化与身体状态的关联
4. 给出基于数据的观察，不超出健康顾问范围
```

- [ ] **Step 5: Handle query-data.md prompt**

Move `src/prompts/capabilities/query-data.md` to `src/prompts/rules/query-guidance.md`. This is a cross-cutting prompt covering all query tools, so it belongs in rules/ rather than any single feature.

```bash
mv src/prompts/capabilities/query-data.md src/prompts/rules/query-guidance.md
```

- [ ] **Step 6: Delete analysis files**

```bash
rm src/store/analysis.ts
rm src/prompts/capabilities/analysis.md
```

- [ ] **Step 7: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove analysis module, add LLM-based analysis guidance rule"
```

---

### Task 15: Update assembler.ts to scan features

**Files:**
- Modify: `src/prompts/assembler.ts`

- [ ] **Step 1: Update readPromptDir to scan features**

Replace the `readPromptDir('capabilities')` call in `assembleSystemPrompt` with a new function that scans `src/features/*/prompt.md`.

Add this function:
```typescript
import { readdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * 扫描所有功能域的提示词文件
 * 从 src/features/*/prompt.md 收集各功能的提示词
 * @returns 拼接后的功能提示词文本
 */
function readFeaturePrompts(): string {
  const featuresDir = join(dirname(PROMPTS_DIR), 'features');
  try {
    const dirs = readdirSync(featuresDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();

    const parts: string[] = [];
    for (const dir of dirs) {
      try {
        const content = readFileSync(join(featuresDir, dir, 'prompt.md'), 'utf-8');
        if (content.trim()) parts.push(content);
      } catch {
        // 功能目录无 prompt.md，跳过
      }
    }
    return parts.join('\n\n');
  } catch {
    return '';
  }
}
```

Then in `assembleSystemPrompt`, replace:
```
Old: parts.push(readPromptDir('capabilities'));
New: parts.push(readFeaturePrompts());
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/prompts/assembler.ts
git commit -m "refactor: update assembler to scan features/*/prompt.md"
```

---

### Task 16: Move generateConversationSummary to session

**Files:**
- Modify: `src/session/manager.ts` (add generateConversationSummary)
- Modify: `src/main.ts` (remove function, import from session)

- [ ] **Step 1: Add generateConversationSummary to session/manager.ts**

Add at the top of the file:
```typescript
import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { Context } from '@mariozechner/pi-ai';
import { config } from '../config';
```

Add the function (moved from main.ts):
```typescript
/**
 * 使用 LLM 生成对话摘要
 * 提取最近对话的关键内容，压缩为一段简短的摘要
 * @param messages 用户的对话消息列表
 * @returns 生成的对话摘要文本
 */
export async function generateConversationSummary(messages: Message[]): Promise<string> {
  const recent = messages.slice(-20);
  const conversationText = recent
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');

  const model = getModel(config.llm.provider as any, config.llm.model as any);

  const context: Context = {
    systemPrompt: '你是一个对话摘要生成器。请用中文将以下健康顾问对话压缩为2-3句话的摘要，保留关键的健康信息、用户提到的问题和建议。只输出摘要内容，不要其他文字。',
    messages: [{
      role: 'user',
      content: conversationText,
      timestamp: Date.now(),
    }],
  };

  const stream = streamSimple(model, context);
  let summary = '';
  for await (const event of stream) {
    if (event.type === 'done' && event.message) {
      summary = event.message.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');
    }
  }
  return summary || '对话摘要生成失败';
}
```

- [ ] **Step 2: Update main.ts**

Remove the `generateConversationSummary` function (lines 26-63).
Add import:
```typescript
import { generateConversationSummary } from './session';
```

Note: `src/session/index.ts` already re-exports from `./manager`, but you may need to add the re-export:
```typescript
export { generateConversationSummary } from './manager';
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/session/manager.ts src/session/index.ts src/main.ts
git commit -m "refactor: move generateConversationSummary to session module"
```

---

### Task 17: Clean up tsconfig and package.json

**Files:**
- Modify: `tsconfig.json`
- Modify: `package.json`

- [ ] **Step 1: Update tsconfig path aliases**

Replace the stale path aliases with ones matching the current structure:

```json
    "paths": {
      "@features/*": ["./src/features/*"],
      "@store/*": ["./src/store/*"],
      "@agent/*": ["./src/agent/*"],
      "@prompts/*": ["./src/prompts/*"],
      "@channels/*": ["./src/channels/*"],
      "@session/*": ["./src/session/*"],
      "@config": ["./src/config.ts"]
    }
```

Note: Do NOT update all imports to use aliases in this step — that's a separate, optional cosmetic change. Just define the aliases so they're available.

- [ ] **Step 2: Move drizzle-kit to devDependencies**

In `package.json`, move `"drizzle-kit": "^0.30.0"` from `dependencies` to `devDependencies`.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json package.json
git commit -m "chore: update tsconfig path aliases and move drizzle-kit to devDependencies"
```

---

### Task 18: Final cleanup

**Files:**
- Verify: `src/store/` only contains: db.ts, schema.ts, record-store.ts, logs.ts, messages.ts, summary.ts, index.ts
- Verify: `src/prompts/capabilities/` is empty or deleted
- Verify: `src/agent/tools.ts` is significantly reduced

- [ ] **Step 1: Remove empty capabilities directory**

```bash
rm -rf src/prompts/capabilities
```

Note: `query-data.md` was already moved to `src/prompts/rules/query-guidance.md` in Task 14. All other capability .md files were moved to their respective features.

- [ ] **Step 2: Verify store/ contents**

Only these files should remain in `src/store/`:
- `db.ts` — DB connection + schema
- `schema.ts` — table definitions
- `record-store.ts` — factory
- `logs.ts` — app logs
- `messages.ts` — message history
- `summary.ts` — conversation summaries
- `index.ts` — Store facade class

- [ ] **Step 3: Run final typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove empty capabilities directory and verify clean structure"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | config.ts, db.ts fix |
| 2 | 3-13 | Feature migrations (water → body → sleep → exercise → observation → diet → symptom → medication → chronic → memory → profile) |
| 3 | 14-18 | Delete analysis, update assembler, move summary func, clean configs |

Total: 18 tasks, ~30 commits. Each task verified with `bun run typecheck`.
