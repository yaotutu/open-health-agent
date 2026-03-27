# HealthClaw Phase 1 改进设计

## 概述

本设计文档描述 HealthClaw Phase 1 的三个核心改进：
1. Session 持久化（基于 SQLite）
2. 配置校验（Schema + 类型转换）
3. 优雅关闭（超时机制）

## 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 持久化内容 | 仅消息历史 | Agent 内部状态难以序列化 |
| 存储格式 | SQLite | Bun 内置支持，避免后期迁移 |
| 历史管理 | 暂不限制 | 个人使用量小，后期按需优化 |
| 配置校验 | 校验+默认值+类型转换 | 体验好，实现成本不高 |
| 优雅关闭 | 增加超时 | 防止关闭卡住 |

---

## 1. Session 持久化

### 1.1 架构

```
src/
├── infrastructure/
│   └── storage/
│       ├── interface.ts          # 已有 - Storage 接口（健康数据）
│       ├── file-storage.ts       # 已有 - JSON 文件存储
│       └── session-store.ts      # 新增 - 会话消息存储
```

### 1.2 接口定义

```typescript
// src/infrastructure/storage/session-store.ts

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

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
```

### 1.3 SQLite Schema

```sql
-- 数据库文件: workspace/sessions.db

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);
```

### 1.4 实现要点

- 使用 Bun 内置的 `bun:sqlite` 模块
- 启动时创建表和索引（IF NOT EXISTS）
- `getMessages` 按 timestamp 排序返回
- `appendMessage` 使用参数化查询防止 SQL 注入

---

## 2. 配置校验

### 2.1 架构

```
src/
├── config/
│   ├── index.ts          # 改造 - 加载 + 校验 + 导出
│   └── schema.ts         # 新增 - 配置 Schema 定义
```

### 2.2 Schema 定义

```typescript
// src/config/schema.ts

export interface ConfigField {
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: unknown;
  enum?: string[];
  envVar: string;  // 对应的环境变量名
}

export interface ConfigSchema {
  [key: string]: {
    [field: string]: ConfigField;
  };
}

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
      envVar: 'LOG_LEVEL'
    },
    env: { type: 'string', default: 'development', envVar: 'NODE_ENV' },
  },
};
```

### 2.3 校验逻辑

```typescript
// src/config/index.ts

export function loadConfig(): ValidatedConfig {
  const errors: string[] = [];
  const config = {};

  for (const [section, fields] of Object.entries(configSchema)) {
    config[section] = {};
    for (const [fieldName, field] of Object.entries(fields)) {
      const value = process.env[field.envVar];
      const result = validateField(fieldName, field, value);

      if (result.error) {
        errors.push(result.error);
      } else {
        config[section][fieldName] = result.value;
      }
    }
  }

  if (errors.length > 0) {
    console.error('[config] Validation errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  return config as ValidatedConfig;
}

function validateField(name: string, field: ConfigField, value: string | undefined) {
  // 1. 检查必填
  if (value === undefined || value === '') {
    if (field.required) {
      return { error: `${name}: Required but not set` };
    }
    return { value: field.default };
  }

  // 2. 类型转换
  let converted: unknown;
  switch (field.type) {
    case 'number':
      converted = parseInt(value, 10);
      if (isNaN(converted)) {
        return { error: `${name}: Must be a number, got "${value}"` };
      }
      break;
    case 'boolean':
      converted = value === 'true' || value === '1';
      break;
    default:
      converted = value;
  }

  // 3. 枚举校验
  if (field.enum && !field.enum.includes(converted as string)) {
    return { error: `${name}: Must be one of [${field.enum.join(', ')}], got "${converted}"` };
  }

  return { value: converted };
}
```

### 2.4 导出类型

```typescript
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

export const config = loadConfig();
```

---

## 3. 优雅关闭增强

### 3.1 改造点

修改 `src/main.ts` 的 shutdown 函数，增加：
- 超时机制（10 秒）
- 错误处理
- 清理所有资源

### 3.2 实现

```typescript
// src/main.ts

const SHUTDOWN_TIMEOUT = 10000; // 10秒

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
```

---

## 4. 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                         启动流程                                 │
├─────────────────────────────────────────────────────────────────┤
│  1. loadConfig()        → 校验配置，失败则退出                    │
│  2. createSessionStore() → 初始化 SQLite，创建表                 │
│  3. createStorage()     → 初始化健康数据存储                     │
│  4. createSessionManager() → 创建会话管理器                      │
│  5. createWebSocketChannel() → 启动 WebSocket 服务               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         请求流程                                 │
├─────────────────────────────────────────────────────────────────┤
│  用户消息 → WebSocket                                            │
│      ↓                                                          │
│  MessageHandler.handle()                                        │
│      ↓                                                          │
│  SessionManager.getOrCreate(userId)                             │
│      ↓                                                          │
│  SessionStore.getMessages(userId) → 加载历史                     │
│      ↓                                                          │
│  Agent (初始化时注入历史消息)                                     │
│      ↓                                                          │
│  Agent.prompt(content) → LLM 响应                               │
│      ↓                                                          │
│  SessionStore.appendMessage() → 保存用户消息和助手响应            │
│      ↓                                                          │
│  WebSocket → 用户                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/infrastructure/storage/session-store.ts` | 新增 | SessionStore 接口和 SQLite 实现 |
| `src/config/schema.ts` | 新增 | 配置 Schema 定义 |
| `src/config/index.ts` | 重构 | 增加校验逻辑，导出类型化配置 |
| `src/application/session/manager.ts` | 改造 | 集成 SessionStore |
| `src/application/session/types.ts` | 改造 | 增加消息历史字段 |
| `src/application/agent/factory.ts` | 改造 | 支持注入历史消息 |
| `src/main.ts` | 改造 | 集成新配置、SessionStore、优雅关闭 |

---

## 6. 验证方式

1. **配置校验测试**
   - 设置 `PORT=abc`，启动应报错并退出
   - 不设置 `LLM_PROVIDER`，启动应报错并退出
   - 设置 `LOG_LEVEL=invalid`，启动应报错并退出

2. **Session 持久化测试**
   - 发送消息，重启服务，继续对话应能记住上下文
   - 检查 `workspace/sessions.db` 文件是否存在且有数据

3. **优雅关闭测试**
   - 启动服务，发送 `SIGINT` (Ctrl+C)，应在 10 秒内正常退出
   - 模拟长时间请求，验证超时强制退出
