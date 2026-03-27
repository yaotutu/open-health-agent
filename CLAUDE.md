# Healthclaw

个人健康顾问 Agent，通过 WebSocket 提供健康数据记录和查询服务。

## 架构

采用 **Clean Architecture** 模式，分层清晰、依赖倒置。

```
src/
├── domain/           # 领域层（零依赖）
│   ├── types.ts           # HealthDataType, HealthRecord, QueryOptions
│   └── events.ts          # 领域事件定义
├── infrastructure/   # 基础设施层
│   ├── storage/           # 存储抽象与实现
│   │   ├── interface.ts   # IStorage 接口
│   │   └── file-storage.ts # JSON 文件存储
│   ├── message-bus/       # 消息总线类型
│   └── logger.ts          # Pino 日志
├── application/      # 应用层
│   ├── agent/             # Agent 工厂与配置
│   │   ├── factory.ts     # 创建 Agent 实例
│   │   ├── prompt.ts      # 系统提示词
│   │   └── tools/         # record, query 工具
│   ├── session/           # 会话管理
│   │   ├── types.ts       # Session, SessionManager 接口
│   │   └── manager.ts     # 会话生命周期管理
│   └── message-handler.ts # 消息处理（通道无关）
├── channels/         # 通道适配器层
│   ├── interface.ts       # ChannelAdapter 接口
│   └── websocket/         # WebSocket 通道
│       ├── server.ts      # WebSocket 服务器
│       ├── adapter.ts     # 适配器实现
│       └── types.ts       # 协议类型
├── config/           # 配置层
│   └── index.ts           # 环境配置集中管理
├── interface/        # 接口层
│   └── websocket/types.ts # WebSocket 类型定义
├── main.ts           # 入口文件
└── index.ts          # 公开 API 导出
```

### 架构特点

- **依赖倒置**: 高层模块不依赖低层模块，都依赖抽象接口
- **通道无关**: 消息处理与通信通道解耦，易于扩展新通道
- **可测试性**: 工厂模式 + 接口抽象便于依赖注入和 Mock

## 协议

**WebSocket 端点:** `/ws`

```typescript
// 客户端 -> 服务器
{ type: 'prompt', content: '...', sessionId?: string, userId?: string }
{ type: 'continue', sessionId?: string, userId?: string }
{ type: 'abort', sessionId?: string, userId?: string }

// 服务器 -> 客户端
{ type: 'event', event: AgentEvent }
{ type: 'done' }
{ type: 'error', error: string }
```

## 数据类型

- `weight` (体重)
- `sleep` (睡眠)
- `diet` (饮食)
- `exercise` (运动)
- `water` (饮水)

每条记录包含：`id`, `type`, `value`, `unit`, `timestamp`, `note`

## 命令

```bash
bun run server     # 启动服务 (端口 3001)
bun run build      # 编译
bun run typecheck  # 类型检查
```

## 配置

通过环境变量配置（推荐创建 `.env` 文件）：

```bash
# 服务器
PORT=3001
WORKSPACE_PATH=./workspace
PUBLIC_PATH=./public

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6

# 日志
LOG_LEVEL=debug    # debug / info / warn / error
NODE_ENV=development
```

## 日志规范

使用 pino 结构化日志，格式：`[模块名] 操作 key=value`

```typescript
logger.info('[server] started port=%d', 3001);
logger.debug('[ws] received type=%s', msg.type);
logger.error('[storage] error=%s', err.message);
```

**禁止使用** `console.log`

## 存储

当前使用 JSON 文件存储：`workspace/records.json`

可通过实现 `IStorage` 接口切换到其他存储后端（数据库、云存储等）。
