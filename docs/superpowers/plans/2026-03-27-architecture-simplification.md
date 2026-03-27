# 架构简化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Clean Architecture 简化为功能模块化架构，统一存储到 SQLite（Drizzle ORM），保留多通道扩展能力。

**Architecture:** 4 个功能模块（channels, agent, session, store）+ 入口文件（main.ts），删除 5 个旧目录（domain, infrastructure, application, interface, config）。

**Tech Stack:** Bun, TypeScript, Drizzle ORM, SQLite, WebSocket, pino

---

## 文件结构

```
src/
├── channels/           # 通道层
│   ├── types.ts        # ChannelAdapter 接口 + 消息类型
│   ├── handler.ts      # 统一消息处理器
│   ├── websocket.ts    # WebSocket 实现
│   └── index.ts        # 导出
├── agent/              # Agent 模块
│   ├── factory.ts      # Agent 创建
│   ├── prompt.ts       # 系统提示词
│   ├── tools.ts        # record/query 工具
│   └── index.ts        # 导出
├── session/            # 会话模块
│   ├── manager.ts      # 会话生命周期管理
│   └── index.ts        # 导出
├── store/              # 存储模块
│   ├── db.ts           # Drizzle 连接初始化
│   ├── schema.ts       # 表结构定义
│   ├── health.ts       # 健康数据操作
│   ├── messages.ts     # 消息历史操作
│   └── index.ts        # 导出
└── main.ts             # 入口
```

---

## Task 1: 安装依赖并清理旧数据

**Files:**
- Modify: `package.json`
- Delete: `workspace/records.json`, `workspace/sessions.db`

- [ ] **Step 1: 安装 Drizzle 依赖**

```bash
bun add drizzle-orm@^0.40.0 drizzle-kit@^0.30.0
```

Expected: 依赖安装成功

- [ ] **Step 2: 清理旧数据文件**

```bash
rm -f workspace/records.json workspace/sessions.db
```

Expected: 旧数据文件已删除

- [ ] **Step 3: 提交**

```bash
git add package.json bun.lock
git commit -m "chore: add drizzle-orm and drizzle-kit dependencies"
```

---

## Task 2: 创建 store/ 模块

**Files:**
- Create: `src/store/schema.ts`
- Create: `src/store/db.ts`
- Create: `src/store/health.ts`
- Create: `src/store/messages.ts`
- Create: `src/store/index.ts`

- [ ] **Step 1: 创建表结构定义**

Create `src/store/schema.ts`:

```typescript
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const healthRecords = sqliteTable('health_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['weight', 'sleep', 'diet', 'exercise', 'water'] }).notNull(),
  value: real('value').notNull(),
  unit: text('unit'),
  note: text('note'),
  timestamp: integer('timestamp').notNull(),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp').notNull(),
});

export type HealthRecord = typeof healthRecords.$inferSelect;
export type NewHealthRecord = typeof healthRecords.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
```

- [ ] **Step 2: 创建数据库连接**

Create `src/store/db.ts`:

```typescript
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { healthRecords, messages } from './schema';

export const createDb = (dbPath: string) => {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema: { healthRecords, messages } });
};

export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 3: 创建健康数据操作**

Create `src/store/health.ts`:

```typescript
import { eq, desc, gte, and } from 'drizzle-orm';
import type { Db } from './db';
import { healthRecords, type HealthRecord, type NewHealthRecord } from './schema';

export interface QueryOptions {
  type?: 'weight' | 'sleep' | 'diet' | 'exercise' | 'water';
  days?: number;
  limit?: number;
}

export const createHealthStore = (db: Db) => {
  const record = async (data: Omit<NewHealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord> => {
    const result = await db.insert(healthRecords)
      .values({ ...data, timestamp: Date.now() })
      .returning();
    return result[0];
  };

  const query = async (options: QueryOptions): Promise<HealthRecord[]> => {
    const conditions = [];

    if (options.type) {
      conditions.push(eq(healthRecords.type, options.type));
    }

    if (options.days) {
      const cutoff = Date.now() - options.days * 24 * 60 * 60 * 1000;
      conditions.push(gte(healthRecords.timestamp, cutoff));
    }

    let query = db.select()
      .from(healthRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(healthRecords.timestamp));

    if (options.limit) {
      query = query.limit(options.limit);
    }

    return query;
  };

  return { record, query };
};

export type HealthStore = ReturnType<typeof createHealthStore>;
```

- [ ] **Step 4: 创建消息历史操作**

Create `src/store/messages.ts`:

```typescript
import { eq, asc } from 'drizzle-orm';
import type { Db } from './db';
import { messages, type Message, type NewMessage } from './schema';

export const createMessageStore = (db: Db) => {
  const getMessages = async (sessionId: string): Promise<Message[]> => {
    return db.select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.timestamp));
  };

  const appendMessage = async (sessionId: string, data: Omit<NewMessage, 'id' | 'sessionId'>): Promise<Message> => {
    const result = await db.insert(messages)
      .values({ ...data, sessionId })
      .returning();
    return result[0];
  };

  const clear = async (sessionId: string): Promise<void> => {
    await db.delete(messages).where(eq(messages.sessionId, sessionId));
  };

  return { getMessages, appendMessage, clear };
};

export type MessageStore = ReturnType<typeof createMessageStore>;
```

- [ ] **Step 5: 创建统一导出**

Create `src/store/index.ts`:

```typescript
import { createDb, type Db } from './db';
import { createHealthStore, type HealthStore } from './health';
import { createMessageStore, type MessageStore } from './messages';
import { healthRecords, messages } from './schema';

export { createDb, createHealthStore, createMessageStore };
export { healthRecords, messages };
export type { Db, HealthStore, MessageStore };

export type HealthRecord = typeof healthRecords.$inferSelect;
export type Message = typeof messages.$inferSelect;

// 统一的 Store 类
export class Store {
  readonly db: Db;
  readonly health: HealthStore;
  readonly messages: MessageStore;

  constructor(dbPath: string) {
    this.db = createDb(dbPath);
    this.health = createHealthStore(this.db);
    this.messages = createMessageStore(this.db);
    this.initTables();
  }

  private initTables(): void {
    // 使用 Bun SQLite 原生创建表
    const sqlite = (this.db as any).session;
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('weight', 'sleep', 'diet', 'exercise', 'water')),
        value REAL NOT NULL,
        unit TEXT,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_records(timestamp)`);
  }

  close(): void {
    (this.db as any).session.close();
  }
}
```

- [ ] **Step 6: 类型检查**

```bash
bun run typecheck
```

Expected: 无类型错误

- [ ] **Step 7: 提交**

```bash
git add src/store/
git commit -m "feat(store): add unified SQLite store with Drizzle ORM"
```

---

## Task 3: 创建 agent/ 模块

**Files:**
- Create: `src/agent/prompt.ts`
- Create: `src/agent/tools.ts`
- Create: `src/agent/factory.ts`
- Create: `src/agent/index.ts`

- [ ] **Step 1: 复制系统提示词**

Create `src/agent/prompt.ts`:

```typescript
export const HEALTH_ADVISOR_PROMPT = `你是用户的私人健康顾问，专注于日常健康管理。

## 你的职责
- 帮助用户记录和追踪健康数据（体重、睡眠、饮食、运动、饮水）
- 根据用户数据提供个性化的健康建议
- 回答健康相关的知识性问题

## 重要：工具调用规则

record_health_data 工具调用时，必须提供完整的 JSON 参数：
- type: 字符串，只能是 weight/sleep/diet/exercise/water 之一
- value: 数字（必填！从用户消息中提取数值）
- unit: 字符串（可选）

示例 - 用户说"我今天体重70公斤"：
正确调用: {"type": "weight", "value": 70, "unit": "kg"}
错误调用: {"type": "weight"}  <- 缺少 value

示例 - 用户说"昨晚睡了8小时"：
正确调用: {"type": "sleep", "value": 8, "unit": "小时"}

如果用户没有提供具体数值，不要调用工具，先询问数值。

## 查询数据时
- 使用 query_health_data 工具获取历史数据
- 用友好、易懂的方式呈现数据趋势

## 注意事项
- 你不是医生，不提供医疗诊断
- 遇到严重健康问题，建议用户就医
- 保持对话简洁、友好`;
```

- [ ] **Step 2: 创建工具定义**

Create `src/agent/tools.ts`:

```typescript
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Store, HealthRecord } from '../store';

const RecordParamsSchema = Type.Object({
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
});

const QueryParamsSchema = Type.Object({
  type: Type.Optional(Type.Union([
    Type.Literal('weight'),
    Type.Literal('sleep'),
    Type.Literal('diet'),
    Type.Literal('exercise'),
    Type.Literal('water'),
  ], { description: '数据类型，不填则查询所有类型' })),
  days: Type.Optional(Type.Number({ description: '查询最近N天的数据，默认7天' })),
  limit: Type.Optional(Type.Number({ description: '最多返回多少条记录，默认10条' })),
});

type RecordParams = typeof RecordParamsSchema;
type QueryParams = typeof QueryParamsSchema;

export const createTools = (store: Store) => {
  const record: AgentTool<RecordParams> = {
    name: 'record_health_data',
    label: '记录健康数据',
    description: '记录用户的健康数据，如体重、睡眠、饮食、运动、饮水量',
    parameters: RecordParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.health.record({
        type: params.type as HealthRecord['type'],
        value: params.value,
        unit: params.unit,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录: ${record.type} ${record.value}${record.unit || ''} (${new Date(record.timestamp).toISOString()})` }],
        details: { id: record.id },
      };
    },
  };

  const query: AgentTool<QueryParams> = {
    name: 'query_health_data',
    label: '查询健康数据',
    description: '查询用户的历史健康数据',
    parameters: QueryParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.health.query({
        type: params.type as HealthRecord['type'] | undefined,
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
  };

  return { record, query };
};
```

- [ ] **Step 3: 创建 Agent 工厂**

Create `src/agent/factory.ts`:

```typescript
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream, UserMessage, AssistantMessage } from '@mariozechner/pi-ai';
import type { Store, Message } from '../store';
import { HEALTH_ADVISOR_PROMPT } from './prompt';
import { createTools } from './tools';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';

const convertMessages = (messages: Message[]): Array<UserMessage | AssistantMessage> => {
  const result: Array<UserMessage | AssistantMessage> = [];
  for (const m of messages) {
    if (m.role === 'user') {
      result.push({
        role: 'user',
        content: m.content,
        timestamp: m.timestamp,
      });
    } else {
      result.push({
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: 'anthropic',
        provider: 'anthropic',
        model: LLM_MODEL,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: m.timestamp,
      });
    }
  }
  return result;
};

const createLoggingStreamFn = () => {
  return (model: unknown, context: Context, options?: unknown): AssistantMessageEventStream => {
    console.log('[llm] >>> request', { model });

    const originalStream = streamSimple(model as any, context, options as any);
    const loggedStream = createAssistantMessageEventStream();
    let finalMessage: unknown = null;

    (async () => {
      try {
        for await (const event of originalStream) {
          if (event.type === 'done') {
            finalMessage = event.message;
          }
          loggedStream.push(event);
        }
        loggedStream.end();
        if (finalMessage) {
          console.log('[llm] <<< response');
        }
      } catch (err) {
        loggedStream.end();
        console.error('[llm] error:', (err as Error).message);
      }
    })();

    return loggedStream;
  };
};

export interface CreateAgentOptions {
  store: Store;
  messages?: Message[];
}

export const createHealthAgent = (options: CreateAgentOptions) => {
  const { store, messages = [] } = options;

  const agentModel = getModel(LLM_PROVIDER as any, LLM_MODEL);
  const tools = createTools(store);
  const toolList = [tools.record, tools.query];

  console.log(`[agent] created provider=${LLM_PROVIDER} model=${LLM_MODEL} tools=${toolList.length}`);

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
      model: agentModel,
      tools: toolList,
      messages: convertMessages(messages),
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
```

- [ ] **Step 4: 创建导出**

Create `src/agent/index.ts`:

```typescript
export { createHealthAgent, type CreateAgentOptions } from './factory';
export { HEALTH_ADVISOR_PROMPT } from './prompt';
export { createTools } from './tools';
```

- [ ] **Step 5: 类型检查**

```bash
bun run typecheck
```

Expected: 无类型错误

- [ ] **Step 6: 提交**

```bash
git add src/agent/
git commit -m "feat(agent): add agent module with tools and factory"
```

---

## Task 4: 创建 session/ 模块

**Files:**
- Create: `src/session/manager.ts`
- Create: `src/session/index.ts`

- [ ] **Step 1: 创建会话管理器**

Create `src/session/manager.ts`:

```typescript
import type { Agent } from '@mariozechner/pi-agent-core';
import type { Store, Message } from '../store';

export interface Session {
  userId: string;
  agent: Agent;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SessionManager {
  getOrCreate(userId: string): Session;
  get(userId: string): Session | undefined;
  remove(userId: string): boolean;
  list(): string[];
}

export interface CreateSessionManagerOptions {
  createAgent: (messages: Message[]) => Agent;
  store: Store;
}

export const createSessionManager = (options: CreateSessionManagerOptions): SessionManager => {
  const { createAgent, store } = options;
  const sessions = new Map<string, Session>();

  const getOrCreate = (userId: string): Session => {
    let session = sessions.get(userId);

    if (!session) {
      session = {
        userId,
        agent: createAgent([]),
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      sessions.set(userId, session);
      console.log(`[session] created userId=${userId} total=${sessions.size}`);

      // 异步加载历史消息
      store.messages.getMessages(userId).then(messages => {
        if (messages.length > 0) {
          session!.agent = createAgent(messages);
          console.log(`[session] loaded ${messages.length} messages for userId=${userId}`);
        }
      });
    }

    session.lastActiveAt = new Date();
    return session;
  };

  const get = (userId: string): Session | undefined => {
    return sessions.get(userId);
  };

  const remove = (userId: string): boolean => {
    const result = sessions.delete(userId);
    if (result) {
      console.log(`[session] removed userId=${userId} total=${sessions.size}`);
    }
    return result;
  };

  const list = (): string[] => {
    return Array.from(sessions.keys());
  };

  return { getOrCreate, get, remove, list };
};
```

- [ ] **Step 2: 创建导出**

Create `src/session/index.ts`:

```typescript
export { createSessionManager, type SessionManager, type Session, type CreateSessionManagerOptions } from './manager';
```

- [ ] **Step 3: 类型检查**

```bash
bun run typecheck
```

Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add src/session/
git commit -m "feat(session): add session manager module"
```

---

## Task 5: 重构 channels/ 模块

**Files:**
- Create: `src/channels/types.ts`
- Create: `src/channels/handler.ts`
- Create: `src/channels/websocket.ts`
- Create: `src/channels/index.ts`

- [ ] **Step 1: 创建通道类型定义**

Create `src/channels/types.ts`:

```typescript
import type { AgentEvent } from '@mariozechner/pi-agent-core';

export interface ChannelAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: MessageHandler): void;
}

export interface ChannelMessage {
  userId: string;
  content: string;
  channel: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelContext {
  send(text: string): Promise<void>;
  sendStream?(text: string, done: boolean): Promise<void>;
}

export type MessageHandler = (
  message: ChannelMessage,
  context: ChannelContext
) => Promise<void>;

// WebSocket 特有类型
export interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
}

export interface ServerMessage {
  type: 'event' | 'error' | 'done';
  event?: AgentEvent;
  error?: string;
}
```

- [ ] **Step 2: 创建消息处理器**

Create `src/channels/handler.ts`:

```typescript
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { SessionManager } from '../session';
import type { Store } from '../store';
import type { ChannelMessage, ChannelContext } from './types';

export interface CreateMessageHandlerOptions {
  sessions: SessionManager;
  store: Store;
}

export const createMessageHandler = (options: CreateMessageHandlerOptions) => {
  const { sessions, store } = options;

  const extractAssistantText = (events: AgentEvent[]): string => {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const msg = event.message;
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              return (block as { text: string }).text;
            }
          }
        }
      }
    }
    return '';
  };

  return async (message: ChannelMessage, context: ChannelContext): Promise<void> => {
    const { userId, content } = message;
    console.log(`[handler] processing userId=${userId} channel=${message.channel}`);

    const session = sessions.getOrCreate(userId);
    const events: AgentEvent[] = [];

    const unsubscribe = session.agent.subscribe((event) => {
      events.push(event);
      if (event.type === 'message_update') {
        const msg = event.message;
        const msgContent = (msg as any)?.content;
        if (msg?.role === 'assistant' && typeof msgContent === 'string') {
          context.sendStream?.(msgContent, false);
        }
      } else if (event.type === 'message_end') {
        context.sendStream?.('', true);
      }
    });

    try {
      // 1. 保存用户消息
      await store.messages.appendMessage(userId, {
        role: 'user',
        content,
        timestamp: Date.now(),
      });

      // 2. 调用 Agent
      await session.agent.prompt(content);

      // 3. 提取响应并保存
      const assistantText = extractAssistantText(events);
      if (assistantText) {
        await store.messages.appendMessage(userId, {
          role: 'assistant',
          content: assistantText,
          timestamp: Date.now(),
        });
        await context.send(assistantText);
      }
    } catch (err) {
      console.error('[handler] error:', (err as Error).message);
      await context.send(`处理出错: ${(err as Error).message}`);
    } finally {
      unsubscribe();
    }
  };
};
```

- [ ] **Step 3: 创建 WebSocket 适配器**

Create `src/channels/websocket.ts`:

```typescript
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ChannelAdapter, MessageHandler, ChannelMessage, ChannelContext, ClientMessage, ServerMessage } from './types';

interface Connection {
  ws: WebSocket;
  userId: string;
}

export interface WebSocketChannelOptions {
  server: http.Server;
  path?: string;
}

export class WebSocketChannel implements ChannelAdapter {
  readonly name = 'websocket';
  private wss: WebSocketServer;
  private connections = new Map<string, Connection>();
  private messageHandler?: MessageHandler;

  constructor(options: WebSocketChannelOptions) {
    const { server, path = '/ws' } = options;
    this.wss = new WebSocketServer({ server, path });
  }

  async start(): Promise<void> {
    this.wss.on('connection', (ws: WebSocket) => {
      const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      console.log(`[ws] client connected connectionId=${connectionId}`);

      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data, connectionId).catch(err => {
          console.error('[ws] error:', (err as Error).message);
          this.sendToWs(ws, { type: 'error', error: (err as Error).message });
        });
      });

      ws.on('close', () => {
        console.log(`[ws] client disconnected connectionId=${connectionId}`);
        this.connections.delete(connectionId);
      });

      ws.on('error', (err: Error) => {
        console.error(`[ws] error: ${err.message}`);
      });
    });
  }

  async stop(): Promise<void> {
    for (const [id, conn] of this.connections) {
      conn.ws.close();
      this.connections.delete(id);
    }
    this.wss.close();
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  private async handleMessage(ws: WebSocket, data: Buffer, connectionId: string): Promise<void> {
    if (!this.messageHandler) {
      throw new Error('Message handler not set');
    }

    const clientMsg: ClientMessage = JSON.parse(data.toString());
    const userId = clientMsg.sessionId || 'default';

    this.connections.set(connectionId, { ws, userId });

    const channelMsg: ChannelMessage = {
      userId,
      content: clientMsg.content || '',
      channel: 'websocket',
      metadata: { connectionId, messageType: clientMsg.type },
    };

    const context: ChannelContext = {
      send: async (text: string) => {
        this.sendToWs(ws, {
          type: 'event',
          event: {
            type: 'message_end',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text }],
            },
          } as any,
        });
        this.sendToWs(ws, { type: 'done' });
      },
      sendStream: async (text: string, done: boolean) => {
        if (done) {
          this.sendToWs(ws, { type: 'done' });
        } else {
          this.sendToWs(ws, {
            type: 'event',
            event: {
              type: 'message_update',
              message: { role: 'assistant', content: text },
            } as any,
          });
        }
      },
    };

    if (clientMsg.type === 'prompt' || clientMsg.type === 'continue') {
      await this.messageHandler(channelMsg, context);
    } else if (clientMsg.type === 'abort') {
      console.log(`[ws] abort requested connectionId=${connectionId}`);
    }
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

export const createWebSocketChannel = (options: WebSocketChannelOptions): WebSocketChannel => {
  return new WebSocketChannel(options);
};
```

- [ ] **Step 4: 创建导出**

Create `src/channels/index.ts`:

```typescript
export type { ChannelAdapter, ChannelMessage, ChannelContext, MessageHandler } from './types';
export { createMessageHandler } from './handler';
export { WebSocketChannel, createWebSocketChannel, type WebSocketChannelOptions } from './websocket';
```

- [ ] **Step 5: 类型检查**

```bash
bun run typecheck
```

Expected: 无类型错误

- [ ] **Step 6: 提交**

```bash
git add src/channels/
git commit -m "feat(channels): refactor channels module with unified interface"
```

---

## Task 6: 重写 main.ts

**Files:**
- Create: `src/main.ts` (replace existing)

- [ ] **Step 1: 重写入口文件**

Replace `src/main.ts`:

```typescript
import 'dotenv/config';
import http from 'http';
import { Store } from './store';
import { createHealthAgent } from './agent';
import { createSessionManager } from './session';
import { createMessageHandler, createWebSocketChannel } from './channels';

const PORT = parseInt(process.env.PORT || '3001', 10);
const DB_PATH = process.env.DB_PATH || './workspace/healthclaw.db';
const SHUTDOWN_TIMEOUT = 10000;

async function main() {
  console.log('[app] starting health advisor agent...');

  // 1. 初始化存储
  const store = new Store(DB_PATH);
  console.log(`[app] database initialized path=${DB_PATH}`);

  // 2. 创建 Agent 工厂
  const createAgent = (messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
    createHealthAgent({ store, messages });

  // 3. 会话管理
  const sessions = createSessionManager({ createAgent, store });

  // 4. 消息处理器
  const handleMessage = createMessageHandler({ sessions, store });

  // 5. 创建 HTTP 服务器
  const server = http.createServer();

  // 6. 启动 WebSocket 通道
  const wsChannel = createWebSocketChannel({ server, path: '/ws' });
  wsChannel.onMessage(handleMessage);
  await wsChannel.start();

  // 7. 监听端口
  server.listen(PORT, () => {
    console.log(`[app] server started port=${PORT}`);
    console.log(`[app] websocket ws://localhost:${PORT}/ws`);
  });

  // 8. 优雅关闭
  const shutdown = async (signal: string) => {
    console.log(`[app] received ${signal}, shutting down...`);

    const timeout = setTimeout(() => {
      console.warn(`[app] shutdown timeout (${SHUTDOWN_TIMEOUT}ms), forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
      await wsChannel.stop();
      server.close();
      store.close();
      clearTimeout(timeout);
      console.log('[app] shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('[app] shutdown error:', (err as Error).message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[app] fatal error:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: 类型检查**

```bash
bun run typecheck
```

Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add src/main.ts
git commit -m "feat(main): rewrite entry point with new architecture"
```

---

## Task 7: 删除旧目录

**Files:**
- Delete: `src/domain/`
- Delete: `src/infrastructure/`
- Delete: `src/application/`
- Delete: `src/interface/`
- Delete: `src/config/`
- Delete: `src/index.ts`

- [ ] **Step 1: 删除旧目录和文件**

```bash
rm -rf src/domain src/infrastructure src/application src/interface src/config
rm -f src/index.ts
```

Expected: 旧目录已删除

- [ ] **Step 2: 类型检查**

```bash
bun run typecheck
```

Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore: remove old architecture layers (domain, infrastructure, application, interface, config)"
```

---

## Task 8: 测试验证

**Files:**
- None (testing only)

- [ ] **Step 1: 启动服务器**

```bash
bun run server
```

Expected: 服务器启动成功，输出 `server started port=3001`

- [ ] **Step 2: 测试 WebSocket 连接**

使用 WebSocket 客户端连接 `ws://localhost:3001/ws`，发送：

```json
{"type": "prompt", "content": "你好", "sessionId": "test"}
```

Expected: 收到响应消息

- [ ] **Step 3: 提交最终状态**

```bash
git add -A
git commit -m "chore: complete architecture simplification"
```

---

## 验收标准

- [ ] 所有类型检查通过 (`bun run typecheck`)
- [ ] 服务器启动成功 (`bun run server`)
- [ ] WebSocket 连接正常
- [ ] 健康数据记录功能正常
- [ ] 消息历史存储正常
- [ ] 旧目录已删除
