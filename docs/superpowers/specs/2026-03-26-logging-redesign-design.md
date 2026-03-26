# 日志系统重构设计

## 背景

当前日志系统过于简陋，无法满足开发调试需求：
- Logger 模块只有 `info`, `error`, `debug` 三个方法
- `debug` 需要设置 `DEBUG` 环境变量才输出
- AgentEvent 丰富的事件类型没有被充分利用（如 `agent_start`, `turn_start` 等）
- 日志输出不一致，没有统一的结构化格式

## 目标

- **所有关键操作都有日志**：Server、WebSocket、Session、Agent、Storage、AgentEvent 全覆盖
- 开发调试时能看到详细日志
- 支持日志级别控制（debug/info/warn/error）
- 统一的结构化日志格式
- 开发环境自动使用 pretty 格式，生产环境使用 JSON

## 技术选型

**日志库**：pino
- 高性能、低开销
- pino-pretty 提供优秀的开发体验
- 结构化 JSON 日志
- 生态丰富

## 架构设计

```
src/logger/
├── index.ts          # 导出 logger 实例
├── formatters.ts     # AgentEvent 格式化函数
└── config.ts         # 日志配置
```

## 日志级别控制

通过 `LOG_LEVEL` 环境变量控制：

```bash
LOG_LEVEL=debug bun run dev   # 开发调试（默认）
LOG_LEVEL=info bun run start  # 正常运行
LOG_LEVEL=warn bun run start  # 安静模式
```

## 日志覆盖范围

### 1. AgentEvent（Agent 事件）

| 事件类型 | 日志级别 | 格式示例 |
|---------|---------|---------|
| `agent_start` | debug | `[agent_start]` |
| `agent_end` | debug | `[agent_end] messages=3` |
| `turn_start` | debug | `[turn_start]` |
| `turn_end` | info | `[turn_end] role=assistant, tools=2` |
| `message_start` | debug | `[message_start] role=user` |
| `message_update` | debug | `[message_update] delta=...` |
| `message_end` | info | `[message_end] role=assistant, tokens=150+80` |
| `tool_execution_start` | info | `[tool] name=record, args={...}` |
| `tool_execution_update` | debug | `[tool_update] partial=...` |
| `tool_execution_end` | info | `[tool_end] name=record, error=false` |

### 2. Server（服务器）

| 操作 | 日志级别 | 格式示例 |
|-----|---------|---------|
| 服务器启动 | info | `[server] started on port 3001` |
| 配置加载 | info | `[server] provider=anthropic, model=claude-sonnet` |
| 健康检查 | debug | `[server] health check, sessions=2` |
| 静态文件请求 | debug | `[server] GET /index.html 200` |
| 404 错误 | warn | `[server] GET /unknown 404` |

### 3. WebSocket（连接）

| 操作 | 日志级别 | 格式示例 |
|-----|---------|---------|
| 客户端连接 | info | `[ws] client connected ip=127.0.0.1` |
| 客户端断开 | info | `[ws] client disconnected` |
| 收到消息 | debug | `[ws] received type=prompt sessionId=default` |
| 发送消息 | debug | `[ws] sent type=event eventType=message_start` |
| 连接错误 | error | `[ws] error: connection reset` |

### 4. Session（会话）

| 操作 | 日志级别 | 格式示例 |
|-----|---------|---------|
| 创建会话 | info | `[session] created id=default` |
| 获取会话 | debug | `[session] get id=default` |
| 删除会话 | info | `[session] removed id=default` |

### 5. Storage（存储）

| 操作 | 日志级别 | 格式示例 |
|-----|---------|---------|
| 记录数据 | info | `[storage] record type=血糖 value=120` |
| 查询数据 | debug | `[storage] query type=血糖 days=7 limit=10` |
| 读取文件 | debug | `[storage] read records.json count=15` |
| 写入文件 | debug | `[storage] write records.json count=16` |
| 存储错误 | error | `[storage] error: permission denied` |

### 6. Agent（代理）

| 操作 | 日志级别 | 格式示例 |
|-----|---------|---------|
| 创建 Agent | info | `[agent] created provider=anthropic model=claude-sonnet` |
| 创建模型失败 | error | `[agent] failed to create model provider=xxx` |

## 使用方式

```typescript
import { logger } from './logger';
import { logAgentEvent } from './logger/formatters';

// 记录 AgentEvent
logAgentEvent(event);

// 普通日志
logger.info({ module: 'ws' }, 'Client connected');
logger.error({ module: 'ws', err }, 'Connection failed');
```

## 输出效果

开发环境（自动 pretty）：
```
09:15:32.123 DEBUG [agent_start]
09:15:32.124 DEBUG [turn_start]
09:15:32.125 DEBUG [message_start] role=user
09:15:32.456 INFO  [tool] name=record, args={"type":"血糖","value":"120"}
09:15:33.012 INFO  [tool_end] name=record, error=false
09:15:33.578 INFO  [message_end] role=assistant, tokens=150+80
09:15:33.579 INFO  [turn_end] role=assistant, tools=1
```

生产环境（JSON）：
```json
{"level":30,"time":1711443332123,"msg":"[message_end] role=assistant, tokens=150+80"}
```

## 文件变更

### 新增文件
1. `src/logger/config.ts` - 日志配置（级别、格式）
2. `src/logger/formatters.ts` - AgentEvent 格式化函数

### 重写文件
3. `src/logger/index.ts` - pino logger 实例

### 修改文件（添加日志）
4. `src/server/index.ts` - Server 启动、配置、HTTP 请求日志
5. `src/server/websocket.ts` - WebSocket 连接、消息、事件日志
6. `src/server/session.ts` - 会话创建、删除日志
7. `src/storage/file-storage.ts` - 存储读写、查询日志
8. `src/agent/index.ts` - Agent 创建日志
9. `src/agent/tools/record.ts` - record 工具日志
10. `src/agent/tools/query.ts` - query 工具日志
11. `package.json` - 添加 pino 和 pino-pretty 依赖

## 防止未来问题

1. **统一入口**：所有日志必须通过 `logger` 模块，禁止直接使用 `console.log`
2. **事件全覆盖**：`logAgentEvent` 函数必须处理所有 AgentEvent 类型，新增事件类型时强制更新
3. **关键操作必记**：新功能的关键操作必须添加日志
4. **类型安全**：使用 TypeScript 确保 AgentEvent 类型完整性
