# HealthClaw MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal health advisor agent with WebSocket server and TUI client.

**Architecture:** Single Agent using pi-agent-core, WebSocket for client communication, file-based storage for health data.

**Tech Stack:** TypeScript, @mariozechner/pi-agent-core, @mariozechner/pi-ai, @mariozechner/pi-tui, ws, chalk, @sinclair/typebox

---

## File Structure

```
healthclaw/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 导出入口
│   ├── logger/
│   │   └── index.ts          # 彩色日志
│   ├── storage/
│   │   ├── index.ts          # 存储接口 + 类型定义
│   │   └── file-storage.ts   # 文件存储实现
│   ├── agent/
│   │   ├── index.ts          # Agent 创建和配置
│   │   ├── system-prompt.ts  # 健康顾问 system prompt
│   │   └── tools/
│   │       ├── index.ts      # 工具导出
│   │       ├── record.ts     # record_health_data
│   │       └── query.ts      # query_health_data
│   ├── server/
│   │   ├── index.ts          # Server 启动入口
│   │   ├── websocket.ts      # WebSocket 服务器
│   │   └── session.ts        # 会话管理
│   └── tui/
│       └── index.ts          # TUI 客户端
└── workspace/
    └── health/
        └── records.json      # 健康数据存储
```

---

## Task 1: 项目初始化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: 初始化 npm 项目**

Run:
```bash
cd /home/yaotutu/code/healthclaw
npm init -y
```

Expected: `package.json` created

- [ ] **Step 2: 安装依赖**

Run:
```bash
npm install typescript tsx @types/node --save-dev
npm install @mariozechner/pi-agent-core @mariozechner/pi-ai @mariozechner/pi-tui ws chalk @sinclair/typebox
npm install @types/ws --save-dev
```

Expected: Dependencies installed

- [ ] **Step 3: 创建 tsconfig.json**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: 更新 package.json 添加 scripts**

Update `package.json` scripts section:
```json
{
  "scripts": {
    "server": "tsx src/server/index.ts",
    "tui": "tsx src/tui/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 5: 创建 workspace 目录**

Run:
```bash
mkdir -p /home/yaotutu/code/healthclaw/workspace/health
```

Expected: `workspace/health` directory created

- [ ] **Step 6: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json
git commit -m "chore: initialize project with dependencies"
```

---

## Task 2: Logger 模块

**Files:**
- Create: `src/logger/index.ts`

- [ ] **Step 1: 创建 logger 模块**

Create `src/logger/index.ts`:
```typescript
import chalk from 'chalk';

const formatTime = () => new Date().toISOString().slice(11, 23);

export const logger = {
  info: (module: string, msg: string, data?: unknown) => {
    console.log(
      chalk.gray(`[${formatTime()}]`) +
      chalk.cyan(`[${module}]`) +
      ` ${msg}`
    );
    if (data !== undefined) {
      console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  },

  error: (module: string, msg: string, err?: Error) => {
    console.error(
      chalk.gray(`[${formatTime()}]`) +
      chalk.red(`[${module}]`) +
      ` ${msg}`
    );
    if (err) {
      console.error(chalk.red(err.stack || err.message));
    }
  },

  debug: (module: string, msg: string, data?: unknown) => {
    if (process.env.DEBUG) {
      console.log(
        chalk.gray(`[${formatTime()}]`) +
        chalk.magenta(`[${module}]`) +
        ` ${msg}`
      );
      if (data !== undefined) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }
  }
};
```

- [ ] **Step 2: 验证 logger 模块编译通过**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/logger/index.ts
git commit -m "feat: add colored logger module"
```

---

## Task 3: Storage 模块

**Files:**
- Create: `src/storage/index.ts`
- Create: `src/storage/file-storage.ts`

- [ ] **Step 1: 创建存储类型和接口**

Create `src/storage/index.ts`:
```typescript
// 健康数据类型
export type HealthDataType = 'weight' | 'sleep' | 'diet' | 'exercise' | 'water';

// 健康记录
export interface HealthRecord {
  id: string;
  type: HealthDataType;
  value: number;
  unit?: string;
  timestamp: string;
  note?: string;
}

// 查询选项
export interface QueryOptions {
  type?: HealthDataType;
  days?: number;
  limit?: number;
}

// 存储接口
export interface Storage {
  record(data: Omit<HealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord>;
  query(options: QueryOptions): Promise<HealthRecord[]>;
}
```

- [ ] **Step 2: 创建文件存储实现**

Create `src/storage/file-storage.ts`:
```typescript
import fs from 'fs/promises';
import path from 'path';
import type { Storage, HealthRecord, QueryOptions } from './index';

// 生成唯一 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// 过滤最近 N 天的记录
const filterByDays = (records: HealthRecord[], days: number) => {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
};

// 过滤指定类型的记录
const filterByType = (records: HealthRecord[], type: string) => {
  return records.filter(r => r.type === type);
};

// 创建文件存储
export const createFileStorage = (dataPath: string): Storage => {
  const filePath = path.join(dataPath, 'records.json');

  // 读取所有记录
  const readAll = async (): Promise<HealthRecord[]> => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  };

  // 写入所有记录
  const writeAll = async (records: HealthRecord[]) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(records, null, 2), 'utf-8');
  };

  // 记录新数据
  const record = async (data: Omit<HealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord> => {
    const records = await readAll();
    const newRecord: HealthRecord = {
      ...data,
      id: generateId(),
      timestamp: new Date().toISOString()
    };
    records.push(newRecord);
    await writeAll(records);
    return newRecord;
  };

  // 查询数据
  const query = async (options: QueryOptions): Promise<HealthRecord[]> => {
    let records = await readAll();

    if (options.type) {
      records = filterByType(records, options.type);
    }

    if (options.days) {
      records = filterByDays(records, options.days);
    }

    // 按时间倒序
    records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    return records;
  };

  return { record, query };
};
```

- [ ] **Step 3: 验证 storage 模块编译通过**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/storage/
git commit -m "feat: add storage module with file-based implementation"
```

---

## Task 4: Agent System Prompt

**Files:**
- Create: `src/agent/system-prompt.ts`

- [ ] **Step 1: 创建 system prompt**

Create `src/agent/system-prompt.ts`:
```typescript
export const HEALTH_ADVISOR_PROMPT = `你是用户的私人健康顾问，专注于日常健康管理。

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
- 保持对话简洁、友好`;
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/system-prompt.ts
git commit -m "feat: add health advisor system prompt"
```

---

## Task 5: Agent Tools

**Files:**
- Create: `src/agent/tools/record.ts`
- Create: `src/agent/tools/query.ts`
- Create: `src/agent/tools/index.ts`

- [ ] **Step 1: 创建 record_health_data 工具**

Create `src/agent/tools/record.ts`:
```typescript
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Storage, HealthDataType } from '../../storage';

export const createRecordTool = (storage: Storage): AgentTool => ({
  name: 'record_health_data',
  description: '记录用户的健康数据，如体重、睡眠、饮食、运动、饮水量',
  parameters: Type.Object({
    type: Type.Union([
      Type.Literal('weight'),
      Type.Literal('sleep'),
      Type.Literal('diet'),
      Type.Literal('exercise'),
      Type.Literal('water'),
    ], { description: '数据类型' }),
    value: Type.Number({ description: '数值' }),
    unit: Type.Optional(Type.String({ description: '单位，如 kg、小时、杯' })),
    note: Type.Optional(Type.String({ description: '备注' })),
  }),
  execute: async (_toolCallId, params, _signal) => {
    const record = await storage.record({
      type: params.type as HealthDataType,
      value: params.value,
      unit: params.unit,
      note: params.note,
    });

    return {
      content: [{ type: 'text', text: `已记录: ${record.type} ${record.value}${record.unit || ''} (${record.timestamp})` }],
      details: { id: record.id },
    };
  },
});
```

- [ ] **Step 2: 创建 query_health_data 工具**

Create `src/agent/tools/query.ts`:
```typescript
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Storage, HealthDataType } from '../../storage';

export const createQueryTool = (storage: Storage): AgentTool => ({
  name: 'query_health_data',
  description: '查询用户的历史健康数据',
  parameters: Type.Object({
    type: Type.Optional(Type.Union([
      Type.Literal('weight'),
      Type.Literal('sleep'),
      Type.Literal('diet'),
      Type.Literal('exercise'),
      Type.Literal('water'),
    ], { description: '数据类型，不填则查询所有类型' })),
    days: Type.Optional(Type.Number({ description: '查询最近N天的数据，默认7天' })),
    limit: Type.Optional(Type.Number({ description: '最多返回多少条记录，默认10条' })),
  }),
  execute: async (_toolCallId, params, _signal) => {
    const records = await storage.query({
      type: params.type as HealthDataType | undefined,
      days: params.days ?? 7,
      limit: params.limit ?? 10,
    });

    if (records.length === 0) {
      return {
        content: [{ type: 'text', text: '没有找到符合条件的健康数据记录。' }],
        details: { count: 0 },
      };
    }

    const lines = records.map(r => {
      const date = new Date(r.timestamp).toLocaleDateString('zh-CN');
      return `- ${date} ${r.type}: ${r.value}${r.unit || ''}${r.note ? ` (${r.note})` : ''}`;
    });

    return {
      content: [{ type: 'text', text: `找到 ${records.length} 条记录:\n${lines.join('\n')}` }],
      details: { count: records.length, records },
    };
  },
});
```

- [ ] **Step 3: 创建工具导出**

Create `src/agent/tools/index.ts`:
```typescript
export { createRecordTool } from './record';
export { createQueryTool } from './query';
```

- [ ] **Step 4: 验证 tools 模块编译通过**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/
git commit -m "feat: add record and query health data tools"
```

---

## Task 6: Agent 模块

**Files:**
- Create: `src/agent/index.ts`

- [ ] **Step 1: 创建 Agent 工厂函数**

Create `src/agent/index.ts`:
```typescript
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import type { Storage } from '../storage';
import { HEALTH_ADVISOR_PROMPT } from './system-prompt';
import { createRecordTool, createQueryTool } from './tools';

export interface CreateAgentOptions {
  storage: Storage;
  provider?: string;
  model?: string;
  apiKey?: string;
}

export const createHealthAgent = (options: CreateAgentOptions) => {
  const { storage, provider = 'anthropic', model, apiKey } = options;

  const agentModel = getModel(provider, model || 'claude-sonnet-4-20250514');

  const tools = [
    createRecordTool(storage),
    createQueryTool(storage),
  ];

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
      model: agentModel,
      tools,
      messages: [],
      thinkingLevel: 'off',
    },
  });

  return agent;
};

export { HEALTH_ADVISOR_PROMPT };
```

- [ ] **Step 2: 验证 agent 模块编译通过**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/agent/index.ts
git commit -m "feat: add agent factory with health tools"
```

---

## Task 7: Session 管理

**Files:**
- Create: `src/server/session.ts`

- [ ] **Step 1: 创建会话管理模块**

Create `src/server/session.ts`:
```typescript
import type { Agent } from '@mariozechner/pi-agent-core';

export interface Session {
  id: string;
  agent: Agent;
  createdAt: Date;
  lastActiveAt: Date;
}

// 创建会话管理器
export const createSessionManager = (createAgent: () => Agent) => {
  const sessions = new Map<string, Session>();

  // 获取或创建会话
  const getOrCreate = (sessionId: string): Session => {
    let session = sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        agent: createAgent(),
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      sessions.set(sessionId, session);
    }

    session.lastActiveAt = new Date();
    return session;
  };

  // 获取会话
  const get = (sessionId: string): Session | undefined => {
    return sessions.get(sessionId);
  };

  // 删除会话
  const remove = (sessionId: string): boolean => {
    return sessions.delete(sessionId);
  };

  // 获取所有会话 ID
  const list = (): string[] => {
    return Array.from(sessions.keys());
  };

  return {
    getOrCreate,
    get,
    remove,
    list,
  };
};

export type SessionManager = ReturnType<typeof createSessionManager>;
```

- [ ] **Step 2: 验证 session 模块编译通过**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/session.ts
git commit -m "feat: add session manager"
```

---

## Task 8: WebSocket 服务器

**Files:**
- Create: `src/server/websocket.ts`

- [ ] **Step 1: 创建 WebSocket 消息类型**

Create `src/server/websocket.ts`:
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { SessionManager } from './session';
import { logger } from '../logger';

// 客户端消息
interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
}

// 服务器消息
interface ServerMessage {
  type: 'event' | 'error' | 'done';
  event?: AgentEvent;
  error?: string;
}

// 发送消息给客户端
const sendMessage = (ws: WebSocket, msg: ServerMessage) => {
  ws.send(JSON.stringify(msg));
};

// 创建 WebSocket 服务器
export const createWebSocketHandler = (
  server: http.Server,
  sessionManager: SessionManager
) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    logger.info('ws', `Client connected from ${clientIp}`);

    ws.on('message', async (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        logger.debug('ws', 'Received message', msg);

        await handleMessage(ws, msg, sessionManager);
      } catch (err) {
        logger.error('ws', 'Failed to handle message', err as Error);
        sendMessage(ws, { type: 'error', error: (err as Error).message });
      }
    });

    ws.on('close', () => {
      logger.info('ws', 'Client disconnected');
    });

    ws.on('error', (err) => {
      logger.error('ws', 'WebSocket error', err);
    });
  });

  return wss;
};

// 处理客户端消息
const handleMessage = async (
  ws: WebSocket,
  msg: ClientMessage,
  sessionManager: SessionManager
) => {
  const sessionId = msg.sessionId || 'default';
  const session = sessionManager.getOrCreate(sessionId);

  switch (msg.type) {
    case 'prompt':
      if (!msg.content) {
        sendMessage(ws, { type: 'error', error: 'Missing content' });
        return;
      }

      logger.info('ws', `Processing prompt for session ${sessionId}`);

      // 订阅 agent 事件
      const unsubscribe = session.agent.subscribe((event) => {
        sendMessage(ws, { type: 'event', event });
      });

      try {
        await session.agent.prompt(msg.content);
        sendMessage(ws, { type: 'done' });
      } finally {
        unsubscribe();
      }
      break;

    case 'abort':
      session.agent.abort();
      logger.info('ws', `Aborted session ${sessionId}`);
      break;

    case 'continue':
      logger.info('ws', `Continue session ${sessionId}`);
      const unsubscribeContinue = session.agent.subscribe((event) => {
        sendMessage(ws, { type: 'event', event });
      });

      try {
        await session.agent.continue();
        sendMessage(ws, { type: 'done' });
      } finally {
        unsubscribeContinue();
      }
      break;

    default:
      sendMessage(ws, { type: 'error', error: `Unknown message type: ${(msg as ClientMessage).type}` });
  }
};
```

- [ ] **Step 2: 验证 websocket 模块编译通过**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/websocket.ts
git commit -m "feat: add WebSocket server with message handling"
```

---

## Task 9: Server 入口

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 1: 创建 Server 入口**

Create `src/server/index.ts`:
```typescript
import http from 'http';
import { config } from 'dotenv';
import { createFileStorage } from '../storage/file-storage';
import { createHealthAgent } from '../agent';
import { createSessionManager } from './session';
import { createWebSocketHandler } from './websocket';
import { logger } from '../logger';

// 加载环境变量
config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || './workspace';

// 创建存储
const storage = createFileStorage(WORKSPACE_PATH);

// 创建会话管理器
const sessionManager = createSessionManager(() =>
  createHealthAgent({
    storage,
    provider: process.env.LLM_PROVIDER,
    model: process.env.LLM_MODEL,
    apiKey: process.env.LLM_API_KEY,
  })
);

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessionManager.list().length }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// 创建 WebSocket 处理器
createWebSocketHandler(server, sessionManager);

// 启动服务器
server.listen(PORT, () => {
  logger.info('server', `HealthClaw server started on port ${PORT}`);
  logger.info('server', `WebSocket: ws://localhost:${PORT}/ws`);
  logger.info('server', `Health check: http://localhost:${PORT}/health`);
  logger.info('server', `Workspace: ${WORKSPACE_PATH}`);
});
```

- [ ] **Step 2: 安装 dotenv**

Run:
```bash
npm install dotenv
```

- [ ] **Step 3: 验证 server 模块编译通过**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts package.json package-lock.json
git commit -m "feat: add server entry point"
```

---

## Task 10: TUI 客户端

**Files:**
- Create: `src/tui/index.ts`

- [ ] **Step 1: 创建 TUI 客户端**

Create `src/tui/index.ts`:
```typescript
import WebSocket from 'ws';
import { TUI, Text, Editor, ProcessTerminal, Markdown, Loader } from '@mariozechner/pi-tui';
import chalk from 'chalk';

const WS_URL = process.env.WS_URL || 'ws://localhost:3000/ws';
const sessionId = `tui-${Date.now()}`;

// 连接 WebSocket
const ws = new WebSocket(WS_URL);

// 创建终端和 TUI
const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

// 消息列表
const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

// 渲染消息
const renderMessages = () => {
  tui.removeChildren();

  // 添加已有消息
  for (const msg of messages) {
    const prefix = msg.role === 'user' ? chalk.blue('You:') : chalk.green('HealthClaw:');
    tui.addChild(new Text(`${prefix} ${msg.content}`, 1, 1));
  }

  tui.requestRender();
};

// 处理 WebSocket 消息
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());

  switch (msg.type) {
    case 'event':
      if (msg.event?.type === 'message_update') {
        const content = msg.event.message?.content || '';
        // 更新最后一条 assistant 消息
        if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
          messages[messages.length - 1].content = content;
        } else {
          messages.push({ role: 'assistant', content });
        }
        renderMessages();
      }
      break;

    case 'done':
      // 消息完成，重新启用输入
      break;

    case 'error':
      tui.addChild(new Text(chalk.red(`Error: ${msg.error}`), 1, 1));
      tui.requestRender();
      break;
  }
});

ws.on('open', () => {
  // 创建输入编辑器
  const editor = new Editor(tui, {
    borderColor: (s) => chalk.gray(s),
    selectList: {
      selectedPrefix: (s) => chalk.cyan(s),
      selectedText: (s) => chalk.white(s),
      description: (s) => chalk.gray(s),
      scrollInfo: (s) => chalk.gray(s),
      noMatch: (s) => chalk.red(s),
    },
  });

  editor.onSubmit = (text) => {
    if (!text.trim()) return;

    // 添加用户消息
    messages.push({ role: 'user', content: text });
    renderMessages();

    // 发送给服务器
    ws.send(JSON.stringify({
      type: 'prompt',
      content: text,
      sessionId,
    }));

    // 清空输入
    editor.setValue('');
  };

  tui.addChild(editor);
  tui.addChild(new Text(chalk.cyan('HealthClaw TUI - Connected to server'), 1, 1));
  tui.addChild(new Text(chalk.gray('Type your message and press Enter to send. Ctrl+C to exit.'), 1, 1));

  tui.start();
});

ws.on('error', (err) => {
  console.error(chalk.red(`WebSocket error: ${err.message}`));
  process.exit(1);
});

ws.on('close', () => {
  console.log(chalk.yellow('Connection closed'));
  process.exit(0);
});
```

- [ ] **Step 2: 验证 TUI 模块编译通过**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/tui/index.ts
git commit -m "feat: add TUI client with WebSocket connection"
```

---

## Task 11: 导出入口和环境变量示例

**Files:**
- Create: `src/index.ts`
- Create: `.env.example`

- [ ] **Step 1: 创建导出入口**

Create `src/index.ts`:
```typescript
// 导出主要模块
export { createFileStorage } from './storage/file-storage';
export type { Storage, HealthRecord, QueryOptions, HealthDataType } from './storage';
export { createHealthAgent } from './agent';
export { HEALTH_ADVISOR_PROMPT } from './agent';
export { createSessionManager } from './server/session';
export type { SessionManager, Session } from './server/session';
export { createWebSocketHandler } from './server/websocket';
export { logger } from './logger';
```

- [ ] **Step 2: 创建环境变量示例**

Create `.env.example`:
```bash
# Server port
PORT=3000

# Workspace path
WORKSPACE_PATH=./workspace

# LLM Provider (anthropic, openai, google, etc.)
LLM_PROVIDER=anthropic

# LLM Model
LLM_MODEL=claude-sonnet-4-20250514

# API Key (or use environment variable like ANTHROPIC_API_KEY)
LLM_API_KEY=your-api-key-here

# Debug mode (set to 1 to enable)
DEBUG=
```

- [ ] **Step 3: 创建 .gitignore**

Create `.gitignore`:
```
node_modules/
dist/
.env
workspace/
*.log
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts .env.example .gitignore
git commit -m "feat: add exports and environment example"
```

---

## Task 12: 最终验证

- [ ] **Step 1: 完整类型检查**

Run:
```bash
npm run typecheck
```

Expected: No errors

- [ ] **Step 2: 测试 server 启动（不使用真实 API key）**

Run:
```bash
LLM_PROVIDER=openai LLM_MODEL=gpt-4o-mini npm run server &
sleep 2
curl http://localhost:3000/health
kill %1
```

Expected: Server starts, health check returns `{"status":"ok","sessions":0}`

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```

---

## 完成后

1. 创建 `.env` 文件并填入真实 API key
2. 启动 server: `npm run server`
3. 启动 TUI: `npm run tui`
4. 开始对话测试
