# 无状态 Agent + 惰性摘要 重构设计

## 背景

当前每个 `UserBot` 持有一个 `SessionManager`，在内存中缓存 `Agent` 实例和完整消息历史。
虽然当前用户量下这个架构够用，但存在以下问题：

1. **SessionManager 过度设计** — 每个 `UserBot` 只对应一个用户，`Map` 里最多 1 个条目，
   但保留了 `get()`、`abort()`、`remove()`、`list()` 等从未被调用的方法
2. **内存状态依赖** — 进程重启会丢失所有 session，`onSessionExpired` 回调不触发，
   导致对话摘要可能漏生成
3. **摘要触发不可靠** — 依赖 7 天 TTL + 1 小时 cleanup 定时器，时机不确定
4. **扩展性差** — 有状态设计无法支持多进程/多机器部署

## 目标

1. 删除 `SessionManager`，Agent 改为每条消息从零创建、用完即弃
2. 摘要触发从"session 过期"改为"用户发消息时检查间隔"，不依赖内存定时器
3. 加 per-user 串行锁，保证同一用户的消息按顺序处理
4. 加兜底回复保证，确保用户每条消息都至少收到一条回复
5. 保持现有功能不变，不改动 store 层、channels 适配器、cron、heartbeat、prompts

## 设计

### 1. 删除 SessionManager

**删除：**
- `SessionManager` 接口和 `createSessionManager` 工厂
- 内存 `Map<string, Session>`
- TTL 定时器和 cleanup 逻辑
- `get()`、`abort()`、`remove()`、`list()`、`close()` 方法

**保留：**
- `generateConversationSummary` 函数（留在 `src/session/` 模块）

### 2. UserBot 简化

**之前：** constructor 里创建 `SessionManager`，通过 `session.getOrCreate()` 复用 Agent

**之后：** 不持有 session，每次处理消息时创建临时 Agent

```
constructor → 只存 userId, store, cronService, channels, 串行锁
handleIncomingMessage → 等锁 → 创建Agent → 处理 → 释放锁
promptAndDeliver → 等锁 → 创建Agent → 处理 → 释放锁
stop → 停 channels（不再需要 session.close()）
```

**串行锁实现：** 用 Promise 链保证同一用户的消息串行处理：

```typescript
private queue: Promise<void> = Promise.resolve();

private async enqueue(fn: () => Promise<void>): Promise<void> {
  const prev = this.queue;
  let resolve: () => void;
  this.queue = new Promise(r => { resolve = r; });
  await prev;
  try {
    await fn();
  } finally {
    resolve!();
  }
}
```

### 3. 惰性摘要

**触发时机：** 用户发消息时，检查距该用户最后一条消息的时间间隔。

**逻辑：**
1. 查询该用户最后一条消息的 `timestamp`
2. 如果距当前时间 > 4 小时：
   - 异步（不阻塞当前请求）加载最近消息
   - 调用 `generateConversationSummary` 生成摘要
   - 存入 `conversation_summaries` 表
3. 无论是否生成摘要，都继续正常处理当前消息

**关键点：** 摘要生成是异步的，用户不需要等待。新创建的 Agent 提示词里会
包含之前已有的摘要，当前对话的摘要在下次回来时才注入。

**摘要间隔判断的数据来源：** 从 `messages` 表查询该用户最后一条消息的时间戳，
不依赖内存状态。

### 4. Handler 改动

`createMessageHandler` 不再接收 `SessionManager`，改为接收 `store` 和 `cronService`，
每次直接创建临时 Agent：

```
处理流程：
1. 惰性摘要检查（异步，不阻塞）
2. 从 DB 加载历史消息
3. 创建临时 Agent（createHealthAgent）
4. 组装最新提示词 → agent.setSystemPrompt()
5. 订阅事件 → agent.prompt() → 捕获响应
6. 存储用户消息和助手回复
7. 推送响应给用户
```

### 5. 兜底回复保证

在 handler 最外层包 try/catch，确保用户每条消息至少收到一条回复：

```typescript
try {
  // 正常处理流程
} catch (err) {
  // 兜底回复：告知用户出问题了
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const fallbackMsg = `抱歉，${timestamp} 处理时出了点问题，请稍后再试。`;
  // 尝试通过 context.send() 或其他方式发送兜底消息
}
```

兜底消息内容格式：`抱歉，[时间] 处理时出了点问题，请稍后再试。`

### 6. 不需要改动的模块

以下模块不受影响：
- `src/agent/factory.ts` — `createHealthAgent` 接口不变
- `src/store/` — 所有存储层不变
- `src/channels/` — 通道适配器不变（QQ、WebSocket）
- `src/cron/` — 定时任务系统不变
- `src/heartbeat/` — 心跳机制不变
- `src/prompts/` — 提示词组装不变

## 文件变动

| 文件 | 变动 |
|------|------|
| `src/session/manager.ts` | 大幅简化：删除 SessionManager，保留 `generateConversationSummary` |
| `src/session/index.ts` | 更新导出 |
| `src/bot/user-bot.ts` | 删除 session 相关代码，加串行锁，改用临时 Agent |
| `src/channels/handler.ts` | 删除 SessionManager 依赖，直接创建 Agent，加惰性摘要 + 兜底回复 |
| `src/store/summary.ts` | 可能加一个查询最后消息时间的辅助方法 |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 每条消息多几次 DB 查询 | 对比 LLM 几秒响应时间可忽略 |
| 每条消息重新组装提示词 | 现有 handler 已经每次调 `setSystemPrompt` 刷新，无额外开销 |
| 摘要异步生成可能失败 | 失败不影响当前消息处理，下次回来会重试 |
| 并发消息可能导致重复摘要 | 串行锁保证同一用户同一时间只处理一条消息 |
