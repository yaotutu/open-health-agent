# 日志系统重构设计

## 背景

当前日志系统过于简陋，无法满足开发调试需求：
- Logger 模块只有 `info`, `error`, `debug` 三个方法
- `debug` 需要设置 `DEBUG` 环境变量才输出
- AgentEvent 丰富的事件类型没有被充分利用（如 `agent_start`, `turn_start` 等）
- 日志输出不一致，没有统一的结构化格式

## 目标

- 开发调试时能看到所有 AgentEvent 详细日志
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

## AgentEvent 日志覆盖

所有事件类型都会被记录：

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

1. **新增** `src/logger/config.ts` - 日志配置
2. **重写** `src/logger/index.ts` - pino logger 实例
3. **新增** `src/logger/formatters.ts` - AgentEvent 格式化函数
4. **修改** `src/server/websocket.ts` - 使用新的 logAgentEvent
5. **修改** `package.json` - 添加 pino 和 pino-pretty 依赖

## 防止未来问题

1. **统一入口**：所有日志必须通过 `logger` 模块，禁止直接使用 `console.log`
2. **事件全覆盖**：`logAgentEvent` 函数必须处理所有 AgentEvent 类型，新增事件类型时强制更新
3. **类型安全**：使用 TypeScript 确保 AgentEvent 类型完整性
