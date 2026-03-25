# HealthClaw - 个人健康助手设计文档

## 概述

HealthClaw 是一个基于 pi-mono 的个人健康顾问智能 Agent，专注于日常健康管理（饮食、运动、睡眠等）。

## 设计目标

- **轻量级**：单 Agent 架构，快速验证核心功能
- **可扩展**：存储层抽象，后期可迁移到数据库
- **易调试**：Server 和 TUI 分离启动，日志清晰
- **统一通信**：WebSocket 协议，TUI/Telegram 等都是客户端

## 架构

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   TUI 客户端 │ ◄──────────────► │   Server        │
│  (pi-tui)   │                    │  (Agent + WS)   │
└─────────────┘                    └─────────────────┘
                                          │
┌─────────────┐     WebSocket              │
│Telegram Bot │ ◄──────────────────────────┤ (后期)
└─────────────┘                            │
                                           ▼
                                   ┌─────────────┐
                                   │ Agent Tools │
                                   │ (操作数据)   │
                                   └──────┬──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │File Storage │
                                   └─────────────┘
```

## 项目结构

```
healthclaw/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 导出入口
│   ├── server/
│   │   ├── index.ts          # Server 启动入口
│   │   ├── websocket.ts      # WebSocket 服务器
│   │   └── session.ts        # 会话管理
│   ├── agent/
│   │   ├── index.ts          # Agent 创建和配置
│   │   ├── system-prompt.ts  # 健康顾问 system prompt
│   │   └── tools/
│   │       ├── index.ts      # 工具导出
│   │       ├── record.ts     # record_health_data
│   │       └── query.ts      # query_health_data
│   ├── storage/
│   │   ├── index.ts          # 存储抽象接口
│   │   └── file-storage.ts   # 文件存储实现
│   ├── tui/
│   │   └── index.ts          # TUI 客户端
│   └── logger/
│       └── index.ts          # 彩色日志
└── workspace/                # 用户数据目录
    └── health/               # 健康数据 JSON 文件
```

## 核心模块

### 1. 存储抽象层 (Storage)

```typescript
// src/storage/index.ts

// 健康记录数据结构
interface HealthRecord {
  type: 'weight' | 'sleep' | 'diet' | 'exercise' | 'water';
  value: number | string;
  unit?: string;
  timestamp: string;  // ISO 8601
  note?: string;
}

// 查询选项
interface QueryOptions {
  type?: string;
  from?: Date;
  to?: Date;
  days?: number;
  limit?: number;
}

// 存储接口（抽象层，支持后期迁移到数据库）
interface Storage {
  record(data: HealthRecord): Promise<void>;
  query(options: QueryOptions): Promise<HealthRecord[]>;
}
```

### 2. Agent Tools

```typescript
// record_health_data 工具
const recordHealthDataTool = {
  name: "record_health_data",
  description: "记录用户的健康数据，如体重、睡眠、饮食、运动、饮水量",
  parameters: Type.Object({
    type: Type.Union([
      Type.Literal("weight"),
      Type.Literal("sleep"),
      Type.Literal("diet"),
      Type.Literal("exercise"),
      Type.Literal("water"),
    ]),
    value: Type.Number({ description: "数值" }),
    unit: Type.Optional(Type.String({ description: "单位，如 kg、小时、杯" })),
    note: Type.Optional(Type.String({ description: "备注" })),
  }),
  execute: async (toolCallId, params, signal) => {
    // 调用 storage.record()
  }
};

// query_health_data 工具
const queryHealthDataTool = {
  name: "query_health_data",
  description: "查询用户的历史健康数据",
  parameters: Type.Object({
    type: Type.Optional(Type.String({ description: "数据类型" })),
    days: Type.Optional(Type.Number({ description: "查询最近N天的数据" })),
  }),
  execute: async (toolCallId, params, signal) => {
    // 调用 storage.query()
  }
};
```

### 3. System Prompt

```typescript
// src/agent/system-prompt.ts
export const HEALTH_ADVISOR_PROMPT = `
你是用户的私人健康顾问，专注于日常健康管理。

## 你的职责
- 帮助用户记录和追踪健康数据（体重、睡眠、饮食、运动、饮水）
- 根据用户数据提供个性化的健康建议
- 回答健康相关的知识性问题

## 记录数据时
- 主动询问缺失的信息（如单位、具体数值）
- 使用 record_health_data 工具保存数据
- 记录成功后给予简短确认

## 查询数据时
- 使用 query_health_data 工具获取历史数据
- 用友好、易懂的方式呈现数据趋势

## 注意事项
- 你不是医生，不提供医疗诊断
- 遇到严重健康问题，建议用户就医
- 保持对话简洁、友好
`;
```

### 4. WebSocket 协议

```typescript
// 客户端 -> 服务器
interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
}

// 服务器 -> 客户端（转发 Agent 事件）
interface ServerMessage {
  type: 'event' | 'error' | 'done';
  event?: AgentEvent;  // pi-agent-core 的事件
  error?: string;
}
```

### 5. 日志模块

```typescript
// src/logger/index.ts
import chalk from 'chalk';

export const logger = {
  info: (module: string, msg: string, data?: object) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(chalk.gray(`[${timestamp}]`) + chalk.cyan(`[${module}]`) + ` ${msg}`);
    if (data) console.log(chalk.gray(JSON.stringify(data, null, 2)));
  },

  error: (module: string, msg: string, err?: Error) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.error(chalk.gray(`[${timestamp}]`) + chalk.red(`[${module}]`) + ` ${msg}`);
    if (err) console.error(chalk.red(err.stack || err.message));
  },

  debug: (module: string, msg: string, data?: object) => {
    if (process.env.DEBUG) {
      const timestamp = new Date().toISOString().slice(11, 23);
      console.log(chalk.gray(`[${timestamp}]`) + chalk.magenta(`[${module}]`) + ` ${msg}`);
      if (data) console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }
};
```

## 启动流程

### Server 启动

1. 加载配置（环境变量）
2. 初始化存储（FileStorage）
3. 创建 Agent（pi-agent-core + tools）
4. 启动 WebSocket 服务
5. 监听连接...

### TUI 启动

1. 连接 WebSocket (ws://localhost:3000/ws)
2. 初始化 TUI (pi-tui)
3. 显示聊天界面
4. 用户输入 → WebSocket 发送 → 接收响应 → 渲染

## 启动命令

```bash
# 启动 Server（带日志输出）
npm run server
# 或
npx tsx src/server/index.ts

# 启动 TUI 客户端（连接到 Server）
npm run tui
# 或
npx tsx src/tui/index.ts

# 开发模式（DEBUG 日志）
DEBUG=1 npm run server
```

## 依赖

| 用途 | 库 | 说明 |
|------|------|------|
| Agent | @mariozechner/pi-agent-core | Agent 运行时 |
| LLM | @mariozechner/pi-ai | 多 provider LLM API |
| TUI | @mariozechner/pi-tui | 终端 UI 框架 |
| WebSocket | ws | WebSocket 服务器/客户端 |
| 日志 | chalk | 终端颜色 |
| Schema | @sinclair/typebox | 运行时类型验证 |

## 编码规范

### 优先级

| 优先级 | 原则 | 说明 |
|--------|------|------|
| **1** | 可读性 | 代码要让人一眼看懂 |
| **2** | 简单函数 | 每个函数只做一件事 |
| **3** | 纯函数 | 相同输入 = 相同输出，便于测试 |
| **4** | 不可变 | 不修改传入的数据 |
| **5** | 依赖注入 | 函数接收依赖作为参数 |

### 示例

```typescript
// ✅ 推荐：简单直接，一目了然
export const filterRecordsByType = (records: HealthRecord[], type: string) => {
  return records.filter(record => record.type === type);
};

// ✅ 推荐：适度组合，不过度抽象
export const queryRecentRecords = async (storage: Storage, type: string, days: number) => {
  const allRecords = await storage.getAll();
  const filtered = filterRecordsByType(allRecords, type);
  const recent = filterRecordsByDays(filtered, days);
  return recent;
};

// ❌ 避免：Class + this
class Storage {
  constructor(private basePath: string) {}
  async record(data: HealthRecord) { ... }  // 避免
}

// ✅ 推荐：工厂函数 + 闭包
export const createStorage = (basePath: string): Storage => {
  const records: HealthRecord[] = [];

  const record = async (data: HealthRecord) => { ... };
  const query = async (options: QueryOptions) => { ... };

  return { record, query };
};
```

## MVP 范围

| 模块 | 功能 | 状态 |
|------|------|------|
| **Server** | WebSocket 启动 | ✅ 必须 |
| **Agent** | 单 Agent + 健康工具 | ✅ 必须 |
| **Storage** | 文件存储（JSON） | ✅ 必须 |
| **WebSocket** | TUI/客户端通信 | ✅ 必须 |
| **TUI** | 终端聊天界面 | ✅ 必须 |
| **Logger** | 彩色日志输出 | ✅ 必须 |
| Telegram Bot | 消息通道 | 🔜 后期 |
| SQLite | 数据库存储 | 🔜 后期 |
| 多 Agent | 专业分工 | 🔜 后期 |
