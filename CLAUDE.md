# Healthclaw

个人健康顾问 Agent，通过 WebSocket 提供健康数据记录和查询服务。

## 架构

```
src/
├── agent/        # Agent 配置和工具
│   ├── index.ts          # 创建 Agent
│   ├── system-prompt.ts  # 系统提示词
│   └── tools/            # record_health_data, query_health_data
├── server/       # HTTP + WebSocket 服务
│   ├── index.ts          # 服务入口
│   ├── websocket.ts      # WebSocket 处理
│   └── session.ts        # 会话管理
├── storage/      # 数据存储
│   └── file-storage.ts   # 文件存储实现
└── logger/       # 日志
```

## 协议

**WebSocket 端口:** `/ws`

```typescript
// 客户端 -> 服务器
{ type: 'prompt', content: '...', sessionId?: 'default' }
{ type: 'continue', sessionId?: 'default' }
{ type: 'abort', sessionId?: 'default' }

// 服务器 -> 客户端
{ type: 'event', event: AgentEvent }
{ type: 'done' }
{ type: 'error', error: '...' }
```

## 数据类型

- weight (体重) / sleep (睡眠) / diet (饮食) / exercise (运动) / water (饮水)

## 命令

```bash
bun run server     # 启动服务 (端口 3001)
bun run build      # 编译
```

## 日志规范

使用 pino，格式：`[模块名] 操作 key=value`

```typescript
logger.info('[server] started port=%d', 3001);
logger.debug('[ws] received type=%s', msg.type);
logger.error('[storage] error=%s', err.message);
```

**控制：** `LOG_LEVEL=debug` (默认) / `info` / `warn` / `error`

**禁止：** `console.log`
