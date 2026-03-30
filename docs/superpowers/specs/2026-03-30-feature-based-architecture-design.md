# Healthclaw 按功能域重组架构设计

## 背景

Healthclaw 当前采用按技术层组织（agent/store/channels/...），随着功能逐步完善，面临以下问题：

1. **tools.ts 约 920 行**：所有工具混合在一个文件，改一个工具要理解全部上下文
2. **store 模式不一致**：medication、chronic 未使用 `createRecordStore` 工厂（observation 已使用）
3. **功能代码分散**：改"饮食"功能需要跳转 agent/tools.ts、store/diet.ts、prompts/capabilities/ 三个目录
4. **分析逻辑违反设计原则**：`analysis.ts` 在代码中做分析计算，但原则是"工具只提供数据存储，所有分析由 AI 完成"

## 设计原则

- **按功能域组织**：每个功能的所有代码（store、tools、prompts）放在同一个文件夹
- **工具只做存储**：删除代码中的分析计算，数据交给 LLM 分析
- **共享基础设施**：schema、DB 连接、工厂函数保留在共享位置
- **避免过度设计**：不引入 service 层、repository 层等额外抽象

## 目标结构

```
src/
├── features/                    # 按功能域组织
│   ├── body/                    # 身体数据
│   │   ├── store.ts             # 数据访问
│   │   ├── tools.ts             # Agent 工具（record_body + query_body_records）
│   │   └── prompt.md            # 该功能的提示词
│   ├── diet/                    # 饮食
│   ├── symptom/                 # 症状
│   ├── exercise/                # 运动
│   ├── sleep/                   # 睡眠
│   ├── water/                   # 饮水
│   ├── medication/              # 用药
│   ├── chronic/                 # 慢性病
│   ├── observation/             # 健康观察
│   ├── memory/                  # 长期记忆
│   │   ├── store.ts
│   │   ├── tools.ts             # save/query/delete_memory
│   │   └── prompt.md
│   └── profile/                 # 用户档案
│       ├── store.ts
│       ├── tools.ts             # get/update_profile
│       └── prompt.md
│
├── agent/
│   ├── factory.ts               # 创建 Agent，从各 features 收集 tools
│   └── tool-factory.ts          # createQueryTool 工厂（共享，各 features/tools.ts 导入使用）
│
├── prompts/
│   ├── core/                    # 角色定义（不变）
│   ├── rules/                   # 行为规则（不变）
│   └── assembler.ts             # 静态：扫描 features/*/capability.md；动态：保留当前逻辑
│
├── store/
│   ├── db.ts                    # DB 连接（补齐缺失的表 schema 导出）
│   ├── schema.ts                # 所有表结构定义（集中，Drizzle 要求）
│   ├── record-store.ts          # createRecordStore 工厂（共享，各 features/store.ts 导入使用）
│   ├── logs.ts                  # 应用日志存储
│   ├── messages.ts              # 消息历史
│   └── summary.ts               # 对话摘要
│
├── channels/                    # 通道适配器（不变）
├── session/                     # 会话管理（吸收 generateConversationSummary）
├── heartbeat/                   # 心跳机制（不变，仍通过 Store 类访问数据）
├── infrastructure/              # 日志（不变）
├── config.ts                    # 新增：集中环境变量管理
└── main.ts                      # 入口
```

## Store 类过渡方案

当前 `Store` 类（`src/store/index.ts`，约 400 行）集中初始化所有存储模块，被 agent、channels、heartbeat、session、assembler 等广泛依赖。直接拆散会导致所有消费者同时中断。

**过渡策略**：保持 `Store` 类作为统一入口（外观模式），但将其内部实现逐步替换为从 features 导入：

```typescript
// 迁移前：Store 类内部创建 store
this.body = createBodyStore(this.sqlite, this.db);

// 迁移后：Store 类从 features 导入
import { createBodyStore } from '../features/body/store';
// Store 类内部不变，只是导入来源变了
```

这样 Store 的公共 API（`store.body`、`store.diet` 等）保持不变，所有消费者无需改动。迁移完成后，`src/store/index.ts` 变成一个薄聚合层，只负责组合各 feature 的 store。

## 改动清单

### 1. 新建 features/ 目录，逐个迁移功能

每个功能文件夹包含三件套：

- **store.ts**：从 `src/store/xxx.ts` 迁移
- **tools.ts**：从 `src/agent/tools.ts` 拆出，包含该功能的 record 和 query 工具
- **prompt.md**：从 `src/prompts/capabilities/xxx.md` 迁移

每迁移一个功能，同步更新：
- `src/store/index.ts`（Store 类）：改为从 features 导入该 store
- `src/agent/tools.ts`：删除已迁移的工具定义

每迁移一个功能后执行 `bun run typecheck` 验证。

迁移顺序（从简单到复杂）：water → body → sleep → exercise → observation → diet → symptom → medication → chronic → memory → profile

### 2. 删除 analysis.ts 及分析工具

删除 `src/store/analysis.ts`（约 300 行）及对应的 `food_symptom_correlation`、`health_patterns` 工具。

**功能替代方案**：LLM 通过查询饮食和症状的原始数据（`query_diet_records` + `query_symptom_records`），结合提示词中的分析指导，自行完成关联分析。需要在 prompts/rules/ 中补充一条规则，指导 LLM 如何进行食物-症状关联分析。

同步从 Store 类中移除 `store.analysis` 成员。

### 3. 修改 assembler.ts

**静态部分**：从读取 `src/prompts/capabilities/*.md` 改为扫描 `src/features/*/prompt.md`，自动收集各功能的提示词。

**动态部分**：`formatRecentRecords` 等动态上下文组装逻辑保留在 assembler.ts 中。虽然这些函数引用了各 store，但它们是"查询并格式化"的展示逻辑，不是业务逻辑，放在 assembler 中是合适的。Store 类的公共 API 不变，所以这些函数无需改动。

### 4. 修改 agent/factory.ts

当前 factory 调用 `createTools(store, userId)` 获取所有工具。改为从各 `features/*/tools.ts` 收集工具，统一注册到 Agent。同时将 factory 中直接读取的 `process.env.LLM_PROVIDER`、`process.env.LLM_MODEL` 改为从 `config.ts` 导入。

### 5. 迁移 generateConversationSummary

从 `src/main.ts`（第 26-63 行）移到 `src/session/manager.ts`，该函数逻辑上属于会话管理。

### 6. 新增 config.ts

集中管理环境变量读取和默认值，替代各模块直接读取 `process.env`：

```typescript
export const config = {
  port: Number(process.env.PORT) || 3001,
  dbPath: process.env.DB_PATH || './data/healthclaw.db',
  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    model: process.env.LLM_MODEL || 'claude-sonnet-4-6',
  },
  qq: {
    appId: process.env.QQBOT_APP_ID,
    appSecret: process.env.QQBOT_APP_SECRET,
    clientSecret: process.env.QQBOT_CLIENT_SECRET,
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
```

### 7. 补齐 db.ts schema 导出

当前 `db.ts` 缺少 medication_records、chronic_conditions、health_observations 表的 schema 导出。补齐以支持 Drizzle Kit 迁移。

### 8. 统一 store 模式

medication 和 chronic 的 store 目前未使用 `createRecordStore` 工厂（observation 已使用）。需要逐一处理：

**symptom**：已在工厂模式基础上扩展 resolve 方法，模式清晰：
```typescript
const baseStore = createRecordStore(...);
export const symptomStore = {
  ...baseStore,
  resolve: (id: string, resolvedAt: Date) => { /* 扩展方法 */ },
};
```

**medication**：当前有 `stop` 方法和 `activeOnly` 自定义查询参数。迁移方案：
- 使用 `createRecordStore` 生成基础 `record/query/getLatest`
- 扩展 `stop` 方法（设置 endDate）
- 扩展 `query`，在标准 QueryOptions 基础上支持 `activeOnly` 过滤
- Store 类外观、assembler、heartbeat runner 中的调用代码需同步更新

**chronic**：当前 API 形状与工厂差异较大（`add` 而非 `record`，使用 `updatedAt` 而非 `timestamp`，有 `deactivate/update` 方法）。迁移方案：
- **不强制使用 createRecordStore**。chronic 的数据模型（无 timestamp、有 active 状态管理）与工厂的 `record/query/getLatest` 模式不匹配
- 保持在 `features/chronic/store.ts` 中手写实现，但遵循一致的导出接口风格
- Store 类外观、assembler、heartbeat runner 中的调用代码需同步更新

### 9. 清理 tsconfig 和 package.json

- 将当前 tsconfig 中不匹配的路径别名（`@domain/*`、`@application/*` 等旧架构遗留）替换为与当前结构匹配的别名（`@features/*`、`@store/*`、`@agent/*`），或直接删除
- `drizzle-kit` 从 dependencies 移到 devDependencies

## 不变的部分

以下模块不做改动：

- **channels/**：WebSocket 和 QQ Bot 通道适配器
- **heartbeat/**：心跳机制（仍通过 Store 类访问数据，Store API 不变）
- **infrastructure/**：Pino 日志
- **prompts/core/**：核心角色定义
- **prompts/rules/**：行为规则（补充一条分析指导规则除外）
- **store/schema.ts**：所有表结构定义（Drizzle 要求集中）
- **store/logs.ts**：应用日志存储，保留在 store/ 下

## 迁移策略

按以下顺序分步执行，每步后运行 `bun run typecheck` 验证：

### 阶段一：基础准备
1. 新建 `config.ts`，集中环境变量
2. 补齐 `db.ts` schema 导出
3. 新建 `features/` 目录结构

### 阶段二：逐个迁移功能（每迁移一个 = 一步）
4. 迁移 water（最简单，验证迁移模式可行）
5. 迁移 body
6. 迁移 sleep
7. 迁移 exercise
8. 迁移 observation
9. 迁移 diet
10. 迁移 symptom（含 resolve 扩展）
11. 迁移 medication（使用 createRecordStore + stop/activeOnly 扩展，同步更新 Store 类、assembler、heartbeat 中的调用代码）
12. 迁移 chronic（手写 store，不强制使用 createRecordStore，同步更新 Store 类、assembler、heartbeat 中的调用代码）
13. 迁移 memory
14. 迁移 profile

### 阶段三：收尾清理
15. 删除 `analysis.ts` 及分析工具，补充 prompts/rules/ 分析指导
16. 修改 `assembler.ts`，扫描 features
17. 修改 `agent/factory.ts`，从 features 收集 tools，使用 config
18. 迁移 `generateConversationSummary` 到 session
19. 清理 tsconfig 路径别名、package.json
20. 删除旧文件（`src/store/body.ts` 等），清理死代码
