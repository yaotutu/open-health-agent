# 架构改进设计文档

## 概述

本次架构改进主要解决以下问题：
1. 健康数据无用户隔离
2. 消息存储字段命名不一致
3. 会话无清理机制
4. WebSocket abort 未实现
5. 代码冗余

## 设计决策

### 用户标识

采用 `channel:userId` 格式作为统一用户标识：
- QQ 用户：`qq:123456789`
- WebSocket 用户：`websocket:default` 或 `websocket:<sessionId>`

**未来扩展**：后期引入账号系统时，可增加用户绑定表，将多个 `channel:userId` 映射到同一个内部账号。

---

## 详细设计

### 1. 健康数据用户隔离

**问题**：`health_records` 表没有 `userId` 字段，所有用户共享数据。

**方案**：增加 `user_id` 字段。

**Schema 变更**：

```sql
-- 新增字段
ALTER TABLE health_records ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

-- 创建索引加速查询
CREATE INDEX idx_health_user_id ON health_records(user_id);
```

**代码变更**：

- `src/store/schema.ts` - 增加 `userId` 字段定义
- `src/store/health.ts` - `record()` 和 `query()` 方法增加 `userId` 参数
- `src/agent/tools.ts` - 工具调用时传入当前用户 ID

---

### 2. 消息存储命名统一

**问题**：`messages` 表使用 `session_id`，但代码中传入的是 `userId`，命名不一致。

**方案**：将 `session_id` 重命名为 `user_id`。

**Schema 变更**：

```sql
-- 重命名字段
ALTER TABLE messages RENAME COLUMN session_id TO user_id;

-- 索引相应调整
DROP INDEX idx_messages_session_id;
CREATE INDEX idx_messages_user_id ON messages(user_id);
```

**代码变更**：

- `src/store/schema.ts` - 字段重命名
- `src/store/messages.ts` - 参数和方法名调整

---

### 3. 会话 TTL 清理

**问题**：会话对象常驻内存，无清理机制。

**方案**：实现 7 天 TTL 自动清理。

**设计**：

```typescript
interface SessionManagerOptions {
  ttlMs?: number;  // 默认 7 * 24 * 60 * 60 * 1000 (7天)
}

// SessionManager 内部：
// 1. 每次访问更新 lastActiveAt
// 2. 定时器定期扫描过期会话并清理
// 3. 清理时只释放内存中的 Agent 实例，消息历史保留在 SQLite
```

**代码变更**：

- `src/session/manager.ts` - 增加 TTL 检查逻辑

**注意**：清理会话不影响用户体验，用户下次发消息时会自动从数据库加载历史消息重建会话。

---

### 4. WebSocket Abort 实现

**问题**：`abort` 消息类型只记录日志，无实际功能。

**方案**：实现请求取消，停止 LLM 调用，不保存未完成的响应。

**设计**：

```typescript
// ChannelMessage 增加消息类型
interface ChannelMessage {
  // ... 现有字段
  type: 'prompt' | 'abort';  // 新增 type 字段
}

// Agent 需要支持取消
// 使用 AbortController 传递取消信号
const abortController = new AbortController();

// WebSocket 收到 abort 时
abortController.abort();
```

**代码变更**：

- `src/channels/types.ts` - 增加消息类型字段
- `src/channels/websocket.ts` - 实现 abort 逻辑
- `src/session/manager.ts` - 支持通过 abortController 取消请求
- `src/agent/factory.ts` - 将 abortSignal 传递给 Agent

---

### 5. 代码优化：sendStream 冗余

**问题**：`websocket.ts` 中 `sendStream` 有大量重复的空 usage 对象。

**方案**：提取公共的辅助函数。

**设计**：

```typescript
// 提取辅助函数
const createEmptyUsage = () => ({
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
});

const createMessageUpdateEvent = (text: string): ServerMessage['event'] => ({
  type: 'message_update',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: '', provider: '', api: '',
    usage: createEmptyUsage(),
    stopReason: 'stop',
    timestamp: Date.now(),
  },
  // ...
});
```

**代码变更**：

- `src/channels/websocket.ts` - 提取辅助函数，简化代码

---

## 变更文件清单

| 文件 | 变更内容 |
|------|----------|
| `src/store/schema.ts` | health_records 增加 userId，messages 的 session_id → userId |
| `src/store/health.ts` | record/query 方法增加 userId 参数 |
| `src/store/messages.ts` | 字段名调整 session_id → userId |
| `src/session/manager.ts` | 增加 TTL 清理逻辑，支持 abort |
| `src/channels/types.ts` | ChannelMessage 增加类型字段 |
| `src/channels/websocket.ts` | 实现 abort，优化代码 |
| `src/channels/handler.ts` | 传递 userId 给工具 |
| `src/agent/tools.ts` | record/query 工具使用 userId |

---

## 迁移策略

由于 SQLite 不支持直接 `DROP COLUMN`，建议：

1. 创建新表结构
2. 迁移数据
3. 删除旧表
4. 重命名新表

或者（更简单）：

- 删除旧数据库文件，重新开始（如果是开发阶段）

---

## 风险评估

- **低风险**：项目处于早期开发阶段，无生产数据
- **向后兼容**：需要清理旧数据库或提供迁移脚本
