# HealthClaw Phase 1 改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Session 持久化（SQLite）、配置校验、优雅关闭增强

**Architecture:** 保持现有 Clean Architecture，新增 SessionStore 基础设施层，改造配置模块支持 Schema 校验，增强 main.ts 的关闭逻辑

**Tech Stack:** TypeScript, Bun, bun:sqlite, pino

**Spec:** `docs/superpowers/specs/2026-03-27-phase1-improvements-design.md`

---

## 文件结构

```
src/
├── config/
│   ├── index.ts              # 改造 - 加载校验逻辑
│   └── schema.ts             # 新增 - Schema 定义
├── infrastructure/
│   └── storage/
│       └── session-store.ts  # 新增 - SQLite 会话存储
├── application/
│   ├── agent/
│   │   └── factory.ts        # 改造 - 支持历史消息注入
│   ├── session/
│   │   ├── types.ts          # 改造 - 增加消息类型
│   │   └── manager.ts        # 改造 - 集成 SessionStore
│   └── message-handler.ts    # 改造 - 保存消息到存储
└── main.ts                   # 改造 - 集成所有改动
```

---

## Task 1: 配置 Schema 定义

**Files:**
- Create: `src/config/schema.ts`

- [ ] **Step 1: 创建配置 Schema 文件**

```typescript
// src/config/schema.ts

/**
 * 配置字段定义
 */
export interface ConfigField {
  /** 值类型 */
  type: 'string' | 'number' | 'boolean';
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 枚举值（仅 string 类型） */
  enum?: string[];
  /** 对应的环境变量名 */
  envVar: string;
}

/**
 * 配置 Schema 结构
 */
export interface ConfigSchema {
  [section: string]: {
    [field: string]: ConfigField;
  };
}

/**
 * 应用配置 Schema
 */
export const configSchema: ConfigSchema = {
  server: {
    port: { type: 'number', default: 3001, envVar: 'PORT' },
    workspacePath: { type: 'string', default: './workspace', envVar: 'WORKSPACE_PATH' },
  },
  llm: {
    provider: { type: 'string', required: true, envVar: 'LLM_PROVIDER' },
    model: { type: 'string', required: true, envVar: 'LLM_MODEL' },
  },
  log: {
    level: {
      type: 'string',
      default: 'debug',
      enum: ['debug', 'info', 'warn', 'error'],
      envVar: 'LOG_LEVEL',
    },
    env: { type: 'string', default: 'development', envVar: 'NODE_ENV' },
  },
};

/**
 * 校验后的配置类型
 */
export interface ValidatedConfig {
  server: {
    port: number;
    workspacePath: string;
  };
  llm: {
    provider: string;
    model: string;
  };
  log: {
    level: 'debug' | 'info' | 'warn' | 'error';
    env: string;
  };
}
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la src/config/schema.ts`
Expected: 文件存在

- [ ] **Step 3: Commit**

```bash
git add src/config/schema.ts
git commit -m "feat(config): add config schema definition"
```

---

## Task 2: 配置校验实现

**Files:**
- Modify: `src/config/index.ts`

- [ ] **Step 1: 重写 config/index.ts 实现校验逻辑**

```typescript
// src/config/index.ts

import { config as dotenvConfig } from 'dotenv';
import { configSchema, type ValidatedConfig, type ConfigField } from './schema.js';

// 加载环境变量
dotenvConfig();

/**
 * 校验单个配置字段
 */
function validateField(
  name: string,
  field: ConfigField,
  envValue: string | undefined
): { value?: unknown; error?: string } {
  // 1. 检查必填
  if (envValue === undefined || envValue === '') {
    if (field.required) {
      return { error: `${name}: Required but not set (env: ${field.envVar})` };
    }
    return { value: field.default };
  }

  // 2. 类型转换
  let converted: unknown;
  switch (field.type) {
    case 'number': {
      converted = parseInt(envValue, 10);
      if (isNaN(converted)) {
        return { error: `${name}: Must be a number, got "${envValue}"` };
      }
      break;
    }
    case 'boolean':
      converted = envValue === 'true' || envValue === '1';
      break;
    default:
      converted = envValue;
  }

  // 3. 枚举校验
  if (field.enum && !field.enum.includes(converted as string)) {
    return {
      error: `${name}: Must be one of [${field.enum.join(', ')}], got "${converted}"`,
    };
  }

  return { value: converted };
}

/**
 * 加载并校验配置
 */
function loadConfig(): ValidatedConfig {
  const errors: string[] = [];
  const config: Record<string, Record<string, unknown>> = {};

  for (const [section, fields] of Object.entries(configSchema)) {
    config[section] = {};
    for (const [fieldName, field] of Object.entries(fields)) {
      const envValue = process.env[field.envVar];
      const result = validateField(fieldName, field, envValue);

      if (result.error) {
        errors.push(result.error);
      } else {
        config[section][fieldName] = result.value;
      }
    }
  }

  if (errors.length > 0) {
    console.error('\n[config] Validation errors:\n');
    errors.forEach((e) => console.error(`  ❌ ${e}`));
    console.error('\nPlease check your .env file or environment variables.\n');
    process.exit(1);
  }

  return config as ValidatedConfig;
}

// 导出校验后的配置（单例）
export const config = loadConfig();

// 向后兼容的具名导出
export const SERVER_CONFIG = {
  PORT: config.server.port,
  WORKSPACE_PATH: config.server.workspacePath,
  PUBLIC_PATH: process.cwd() + '/public',
} as const;

export const LLM_CONFIG = {
  PROVIDER: config.llm.provider,
  MODEL: config.llm.model,
} as const;

export const LOG_CONFIG = {
  LEVEL: config.log.level,
  ENV: config.log.env,
} as const;

// MIME 类型映射
export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
} as const;
```

- [ ] **Step 2: 验证类型检查通过**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 3: 测试配置校验 - 缺少必填项**

Run: `LLM_PROVIDER= LLM_MODEL= bun run src/main.ts 2>&1 | head -10`
Expected: 输出校验错误并退出

- [ ] **Step 4: 测试配置校验 - 正常启动**

Run: `bun run server &` (后台启动，然后 `pkill -f "tsx src/main.ts"`)
Expected: 正常启动（使用 .env 中的配置）

- [ ] **Step 5: Commit**

```bash
git add src/config/index.ts
git commit -m "feat(config): implement config validation with schema"
```

---

## Task 3: Session Store 接口和实现

**Files:**
- Create: `src/infrastructure/storage/session-store.ts`

- [ ] **Step 1: 创建 SessionStore 实现**

```typescript
// src/infrastructure/storage/session-store.ts

import { Database } from 'bun:sqlite';
import { logger } from '../logger.js';

/**
 * 消息记录
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Session 存储接口
 */
export interface SessionStore {
  /** 获取会话的消息历史 */
  getMessages(sessionId: string): Promise<Message[]>;
  /** 追加消息到会话 */
  appendMessage(sessionId: string, message: Message): Promise<void>;
  /** 清空会话历史 */
  clear(sessionId: string): Promise<void>;
  /** 关闭数据库连接 */
  close(): Promise<void>;
}

/**
 * SQLite Session 存储实现
 */
export class SqliteSessionStore implements SessionStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTables();
    logger.info('[session-store] initialized path=%s', dbPath);
  }

  private initTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_session_id ON messages(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)`);
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const query = this.db.query<Message, [string]>(`
      SELECT role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return query.all(sessionId);
  }

  async appendMessage(sessionId: string, message: Message): Promise<void> {
    const query = this.db.query(`
      INSERT INTO messages (session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    query.run(sessionId, message.role, message.content, message.timestamp);
    logger.debug('[session-store] appended message sessionId=%s role=%s', sessionId, message.role);
  }

  async clear(sessionId: string): Promise<void> {
    const query = this.db.query(`DELETE FROM messages WHERE session_id = ?`);
    query.run(sessionId);
    logger.info('[session-store] cleared sessionId=%s', sessionId);
  }

  async close(): Promise<void> {
    this.db.close();
    logger.info('[session-store] closed');
  }
}

/**
 * 创建 Session 存储实例
 */
export const createSessionStore = (workspacePath: string): SessionStore => {
  const dbPath = `${workspacePath}/sessions.db`;
  return new SqliteSessionStore(dbPath);
};
```

- [ ] **Step 2: 验证类型检查通过**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/storage/session-store.ts
git commit -m "feat(storage): add SQLite session store implementation"
```

---

## Task 4: 改造 Session Manager 集成存储

**Files:**
- Modify: `src/application/session/types.ts`
- Modify: `src/application/session/manager.ts`

- [ ] **Step 1: 更新 Session 类型定义**

```typescript
// src/application/session/types.ts

import type { Agent } from '@mariozechner/pi-agent-core';
import type { Message } from '../../infrastructure/storage/session-store.js';

/**
 * 会话 - 与通道无关，按userId管理
 */
export interface Session {
  /** 用户ID（跨通道统一标识） */
  userId: string;
  /** Agent实例 */
  agent: Agent;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活跃时间 */
  lastActiveAt: Date;
  /** 消息历史（内存缓存） */
  messageHistory: Message[];
  /** 是否已从存储加载 */
  loaded: boolean;
}

/**
 * 会话管理器接口
 */
export interface SessionManager {
  /** 获取或创建会话 */
  getOrCreate(userId: string): Session;
  /** 获取会话 */
  get(userId: string): Session | undefined;
  /** 删除会话 */
  remove(userId: string): boolean;
  /** 获取所有会话 */
  list(): string[];
  /** 保存会话消息 */
  saveMessage(userId: string, message: Message): Promise<void>;
}
```

- [ ] **Step 2: 更新 Session Manager 实现**

```typescript
// src/application/session/manager.ts

import type { Agent } from '@mariozechner/pi-agent-core';
import type { SessionStore, Message } from '../../infrastructure/storage/session-store.js';
import { logger } from '../../infrastructure/logger.js';
import type { Session, SessionManager } from './types.js';

export interface CreateSessionManagerOptions {
  createAgent: (messages: Message[]) => Agent;
  sessionStore: SessionStore;
}

export const createSessionManager = (options: CreateSessionManagerOptions): SessionManager => {
  const { createAgent, sessionStore } = options;
  const sessions = new Map<string, Session>();

  const getOrCreate = (userId: string): Session => {
    let session = sessions.get(userId);

    if (!session) {
      session = {
        userId,
        agent: createAgent([]), // 初始为空，后续异步加载
        createdAt: new Date(),
        lastActiveAt: new Date(),
        messageHistory: [],
        loaded: false,
      };
      sessions.set(userId, session);
      logger.info('[session] created userId=%s total=%d', userId, sessions.size);
    } else {
      logger.debug('[session] accessed userId=%s', userId);
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
      logger.info('[session] removed userId=%s total=%d', userId, sessions.size);
    }
    return result;
  };

  const list = (): string[] => {
    return Array.from(sessions.keys());
  };

  const saveMessage = async (userId: string, message: Message): Promise<void> => {
    const session = sessions.get(userId);
    if (session) {
      session.messageHistory.push(message);
    }
    await sessionStore.appendMessage(userId, message);
  };

  return {
    getOrCreate,
    get,
    remove,
    list,
    saveMessage,
  };
};

// 向后兼容：支持旧的调用方式（不含 sessionStore）
export const createSimpleSessionManager = (createAgent: () => Agent): SessionManager => {
  return createSessionManager({
    createAgent: () => createAgent(),
    sessionStore: {
      getMessages: async () => [],
      appendMessage: async () => {},
      clear: async () => {},
      close: async () => {},
    },
  });
};
```

- [ ] **Step 3: 验证类型检查通过**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/application/session/types.ts src/application/session/manager.ts
git commit -m "feat(session): integrate SessionStore into SessionManager"
```

---

## Task 5: 改造 Agent Factory 支持历史消息

**Files:**
- Modify: `src/application/agent/factory.ts`

- [ ] **Step 1: 更新 Agent Factory**

```typescript
// src/application/agent/factory.ts

import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Storage } from '../../infrastructure/storage/interface.js';
import type { Message } from '../../infrastructure/storage/session-store.js';
import { logger } from '../../infrastructure/logger.js';
import { config } from '../../config/index.js';
import { HEALTH_ADVISOR_PROMPT } from './prompt.js';
import { createRecordTool, createQueryTool } from './tools/index.js';

export interface CreateAgentOptions {
  storage: Storage;
  provider?: string;
  model?: string;
  /** 初始消息历史 */
  messages?: Message[];
}

/**
 * 创建带日志的stream函数
 */
const createLoggingStreamFn = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (model: any, context: Context, options?: any): AssistantMessageEventStream => {
    logger.info({ model, context, options }, '[llm] >>> request');

    const originalStream = streamSimple(model, context, options);
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
          logger.info({ response: finalMessage }, '[llm] <<< response');
        }
      } catch (err) {
        loggedStream.end();
        logger.error('[llm] error: %s', (err as Error).message);
      }
    })();

    return loggedStream;
  };
};

/**
 * 将 Message[] 转换为 Agent 消息格式
 */
const convertMessages = (messages: Message[]): Array<{ role: 'user' | 'assistant'; content: string }> => {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
};

/**
 * 创建健康顾问Agent
 */
export const createHealthAgent = (options: CreateAgentOptions) => {
  const {
    storage,
    provider = config.llm.provider,
    model = config.llm.model,
    messages = [],
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentModel = getModel(provider as any, model);

  const tools = [createRecordTool(storage), createQueryTool(storage)];

  logger.info(
    '[agent] created provider=%s model=%s tools=%d historyLength=%d',
    provider,
    model,
    tools.length,
    messages.length
  );

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
      model: agentModel,
      tools,
      messages: convertMessages(messages),
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
```

- [ ] **Step 2: 验证类型检查通过**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/application/agent/factory.ts
git commit -m "feat(agent): support injecting message history"
```

---

## Task 6: 改造 Message Handler 保存消息

**Files:**
- Modify: `src/application/message-handler.ts`

- [ ] **Step 1: 更新 Message Handler**

```typescript
// src/application/message-handler.ts

import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { ChannelMessage, ChannelResponse, ChannelStreamChunk } from '../infrastructure/message-bus/types.js';
import type { SessionManager } from './session/types.js';
import type { Message } from '../infrastructure/storage/session-store.js';
import { logger } from '../infrastructure/logger.js';

export interface MessageHandlerOptions {
  sessionManager: SessionManager;
}

export interface MessageHandler {
  handle(message: ChannelMessage): Promise<ChannelResponse>;
  handleStream(message: ChannelMessage, onChunk: (chunk: ChannelStreamChunk) => void): Promise<void>;
}

/**
 * 创建统一消息处理器
 * 所有通道的消息都通过这里处理，与通道类型无关
 */
export const createMessageHandler = (options: MessageHandlerOptions): MessageHandler => {
  const { sessionManager } = options;

  /**
   * 处理Agent事件并转换为文本
   */
  const processAgentEvents = (events: AgentEvent[]): string => {
    let response = '';

    for (const event of events) {
      switch (event.type) {
        case 'message_end': {
          const msg = event.message;
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text') {
                response += (block as { text: string }).text;
              }
            }
          }
          break;
        }
        case 'tool_execution_end': {
          if (event.isError) {
            response += `\n[工具执行错误: ${JSON.stringify(event.result)}]`;
          }
          break;
        }
      }
    }

    return response;
  };

  /**
   * 从 Agent 事件中提取助手响应文本
   */
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

  /**
   * 处理单条消息（非流式）
   */
  const handle = async (message: ChannelMessage): Promise<ChannelResponse> => {
    const { userId, content } = message;

    logger.info('[handler] processing message userId=%s channel=%s', userId, message.channel);

    const session = sessionManager.getOrCreate(userId);
    const events: AgentEvent[] = [];

    const unsubscribe = session.agent.subscribe((event) => {
      events.push(event);
    });

    try {
      // 1. 保存用户消息
      const userMessage: Message = {
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      await sessionManager.saveMessage(userId, userMessage);

      // 2. 调用 Agent
      await session.agent.prompt(content);

      // 3. 提取响应并保存
      const responseText = processAgentEvents(events);
      const assistantText = extractAssistantText(events);
      if (assistantText) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: assistantText,
          timestamp: Date.now(),
        };
        await sessionManager.saveMessage(userId, assistantMessage);
      }

      return {
        content: responseText || '处理完成',
        done: true,
      };
    } catch (err) {
      logger.error('[handler] error processing message: %s', (err as Error).message);
      return {
        content: `处理出错: ${(err as Error).message}`,
        done: true,
      };
    } finally {
      unsubscribe();
    }
  };

  /**
   * 处理流式消息
   */
  const handleStream = async (
    message: ChannelMessage,
    onChunk: (chunk: ChannelStreamChunk) => void
  ): Promise<void> => {
    const { userId, content } = message;

    logger.info('[handler] processing stream userId=%s channel=%s', userId, message.channel);

    const session = sessionManager.getOrCreate(userId);
    let buffer = '';
    let fullResponse = '';

    const unsubscribe = session.agent.subscribe((event) => {
      switch (event.type) {
        case 'message_update': {
          const msg = event.message;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msgContent = (msg as any)?.content;
          if (msg?.role === 'assistant' && typeof msgContent === 'string') {
            const newText = msgContent.slice(buffer.length);
            if (newText) {
              buffer = msgContent;
              fullResponse = msgContent;
              onChunk({ content: newText, done: false });
            }
          }
          break;
        }
        case 'message_end': {
          onChunk({ content: '', done: true });
          break;
        }
      }
    });

    try {
      // 1. 保存用户消息
      const userMessage: Message = {
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      await sessionManager.saveMessage(userId, userMessage);

      // 2. 调用 Agent
      await session.agent.prompt(content);

      // 3. 保存助手响应
      if (fullResponse) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now(),
        };
        await sessionManager.saveMessage(userId, assistantMessage);
      }
    } catch (err) {
      logger.error('[handler] stream error: %s', (err as Error).message);
      onChunk({ content: `\n[错误: ${(err as Error).message}]`, done: true });
    } finally {
      unsubscribe();
    }
  };

  return {
    handle,
    handleStream,
  };
};
```

- [ ] **Step 2: 验证类型检查通过**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/application/message-handler.ts
git commit -m "feat(handler): save messages to SessionStore"
```

---

## Task 7: 改造 main.ts 集成所有改动

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: 更新 main.ts**

```typescript
// src/main.ts

/**
 * 健康助手Agent - 应用入口
 * 支持多通道（WebSocket、Telegram等）
 */
import http from 'http';
import { config } from './config/index.js';
import { createFileStorage } from './infrastructure/storage/file-storage.js';
import { createSessionStore } from './infrastructure/storage/session-store.js';
import { createSessionManager } from './application/session/manager.js';
import { createMessageHandler } from './application/message-handler.js';
import { createHealthAgent } from './application/agent/factory.js';
import { createWebSocketChannel } from './channels/websocket/server.js';
import { logger } from './infrastructure/logger.js';

const SHUTDOWN_TIMEOUT = 10000; // 10秒

async function main() {
  logger.info('[app] starting health advisor agent...');

  // 1. 基础设施层 - 存储初始化
  const storage = createFileStorage(config.server.workspacePath);
  const sessionStore = createSessionStore(config.server.workspacePath);

  // 2. 应用层 - Agent工厂（支持历史消息）
  const createAgent = (messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
    createHealthAgent({ storage, messages });

  // 3. 会话管理器（集成存储）
  const sessionManager = createSessionManager({
    createAgent,
    sessionStore,
  });

  // 4. 消息处理器（通道无关）
  const messageHandler = createMessageHandler({ sessionManager });

  // 5. 创建HTTP服务器
  const server = http.createServer(async (req, res) => {
    // 健康检查
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          sessions: sessionManager.list().length,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // 静态文件服务（简化版）
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      let filePath = req.url === '/' ? '/index.html' : req.url!;
      const fullPath = path.join(process.cwd(), 'public', filePath);

      // 防止目录遍历
      if (!fullPath.startsWith(path.join(process.cwd(), 'public'))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(fullPath);
      const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
      }[ext] || 'application/octet-stream';

      const content = await fs.readFile(fullPath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  // 6. 创建并启动WebSocket通道
  const wsChannel = createWebSocketChannel({
    server,
    path: '/ws',
  });

  // 设置消息处理器
  wsChannel.onMessage(async (message) => {
    return await messageHandler.handle(message);
  });

  await wsChannel.start();

  // 7. 启动服务器
  server.listen(config.server.port, () => {
    logger.info('[app] server started port=%d', config.server.port);
    logger.info('[app] websocket ws://localhost:%d/ws', config.server.port);
    logger.info('[app] health check http://localhost:%d/health', config.server.port);
    logger.info('[app] workspace path=%s', config.server.workspacePath);
  });

  // 8. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info('[app] received %s, shutting down...', signal);

    const timeout = setTimeout(() => {
      logger.warn('[app] shutdown timeout (%dms), forcing exit', SHUTDOWN_TIMEOUT);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
      // 1. 停止接收新连接
      await wsChannel.stop();

      // 2. 关闭 HTTP 服务器
      server.close();

      // 3. 关闭存储
      await storage.close?.();
      await sessionStore.close();

      clearTimeout(timeout);
      logger.info('[app] shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('[app] shutdown error: %s', (err as Error).message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('[app] fatal error: %s', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: 验证类型检查通过**

Run: `bun run typecheck`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): integrate SessionStore, config validation, graceful shutdown"
```

---

## Task 8: 端到端验证

**Files:**
- None (验证任务)

- [ ] **Step 1: 验证配置校验 - 正常启动**

Run: `bun run server &`
Expected: 服务器正常启动，日志显示配置加载成功

- [ ] **Step 2: 验证 Session 持久化 - 发送消息**

Run: 发送 WebSocket 消息测试
```bash
cat << 'EOF' | bun run -
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3001/ws');
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'prompt', content: '你好，我是测试用户', userId: 'test-persist' }));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'done') {
    console.log('✅ 消息已保存');
    ws.close();
    process.exit(0);
  }
});
EOF
```
Expected: 消息发送成功

- [ ] **Step 3: 验证 Session 持久化 - 检查数据库**

Run: `sqlite3 workspace/sessions.db "SELECT * FROM messages WHERE session_id='test-persist' LIMIT 5;"`
Expected: 显示刚发送的消息记录

- [ ] **Step 4: 验证优雅关闭**

Run: `kill -SIGTERM $(pgrep -f "tsx src/main.ts")`
Expected: 日志显示 shutdown complete，10 秒内退出

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 improvements

- Session persistence with SQLite
- Config validation with schema
- Graceful shutdown with timeout

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 验证清单

- [ ] 配置校验：`PORT=abc` 启动报错
- [ ] 配置校验：`LLM_PROVIDER=` 启动报错
- [ ] 配置校验：`LOG_LEVEL=invalid` 启动报错
- [ ] Session 持久化：消息保存到 `workspace/sessions.db`
- [ ] Session 持久化：重启后对话能记住上下文
- [ ] 优雅关闭：SIGINT/SIGTERM 后 10 秒内退出
