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
  - 注意：`close()` 当前在 `UserBot.stop()` 中被调用，重构后移除该调用
  - 注意：`abort()` 虽然 WebSocket 协议定义了 abort 消息类型，但当前未实际连接（dead code），
    重构时需要决定 abort 如何处理（见第 7 节）

**保留：**
- `generateConversationSummary` 函数（留在 `src/session/` 模块）

### 2. UserBot 简化

**之前：** constructor 里创建 `SessionManager`，通过 `session.getOrCreate()` 复用 Agent

**之后：** 不持有 session，每次处理消息时创建临时 Agent

```
constructor → 只存 userId, store, cronService, channels, 串行锁
handleIncomingMessage → 等锁 → 惰性摘要检查 → 创建Agent → 处理 → 释放锁
promptAndDeliver → 等锁 → 创建Agent → 处理 → 释放锁（不触发惰性摘要）
stop → 停 channels（不再需要 session.close()）

**注意：** 惰性摘要只在 `handleIncomingMessage`（用户主动发消息）时触发，
`promptAndDeliver`（cron/heartbeat 触发）不触发摘要生成。
```

**串行锁实现：** 用 Promise 链保证同一用户的消息串行处理。
锁必须覆盖 `handleIncomingMessage` 和 `promptAndDeliver` 两个入口，
因为两者都可能触发 Agent 创建（用户消息 vs cron/heartbeat）：

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

// handleIncomingMessage 和 promptAndDeliver 都通过 enqueue 执行
async handleIncomingMessage(message, context) {
  await this.enqueue(() => this.processWithTempAgent(message, context));
}

async promptAndDeliver(message, deliver) {
  return this.enqueue(async () => {
    // 1. 从 DB 加载历史消息
    // 2. 创建临时 Agent（createHealthAgent）
    // 3. 订阅 message_end 事件（捕获助手响应）
    // 4. agent.prompt(withTimeContext(message))
    // 5. 取消订阅，提取响应文本
    // 6. 如果有响应且 deliver=true：存储助手消息 + sendToUser
    // 7. 如果步骤 1-6 任何环节失败：兜底回复（同 handler 的兜底逻辑）
    // 8. 返回响应文本（或 null）
  });
}
```

**promptAndDeliver 与 handler 的区别：**
- handler 接收 `ChannelMessage`（可能有图片），promptAndDeliver 接收纯文本
- handler 通过 `ChannelContext.send()` 回复，promptAndDeliver 通过 `sendToUser()` 推送
- handler 的响应是流式或完整发送，promptAndDeliver 累积后发送
- promptAndDeliver 也需要兜底回复（cron 任务失败时用户需要知道）

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

**摘要间隔判断的数据来源：** 需要在 `MessageStore` 中新增一个
`getLastMessageTimestamp(userId)` 方法，只查最后一条消息的时间戳，
避免加载完整消息列表。这是一个必要的新增查询方法。

**"异步"的含义：** fire-and-forget，不 await Promise。摘要生成和当前消息处理
完全并行。摘要生成可能失败，但失败不影响当前消息处理，下次回来时满足条件会重试。

**阈值选择：** 4 小时是初始值，可配置。选择理由：用户离开 4 小时后回来，
大概率是一段新的对话，适合生成上一段的摘要。太短（如 30 分钟）会频繁调用 LLM
浪费 token，太长（如 7 天）会导致摘要不及时。

### 4. Handler 改动

`createMessageHandler` 不再接收 `SessionManager`，改为接收一个 `createAgent` 工厂函数：

```typescript
interface CreateMessageHandlerOptions {
  /** Agent 工厂：接收 userId 和历史消息，返回临时 Agent */
  createAgent: (userId: string, messages: Message[]) => Promise<Agent>;
  store: Store;
}
```

这样做的好处：
- handler 不知道 Agent 怎么创建的，只负责使用
- `UserBot` 构造函数设置工厂（传入 `store`、`cronService`、`channel` 等依赖）
- handler 和 `UserBot` 之间通过工厂解耦

```
处理流程：
1. 惰性摘要检查（fire-and-forget，不阻塞，不等待 Promise）
2. 从 DB 加载历史消息
3. 通过 createAgent 工厂创建临时 Agent
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
| `src/bot/user-bot.ts` | 删除 session 相关代码，加串行锁，改用临时 Agent，移除 `stop()` 中 `session.close()` |
| `src/channels/handler.ts` | 接收 `createAgent` 工厂替代 SessionManager，加惰性摘要 + 兜底回复 |
| `src/store/messages.ts` | 新增 `getLastMessageTimestamp(userId)` 方法（摘要触发需要） |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 每条消息多几次 DB 查询 | 对比 LLM 几秒响应时间可忽略 |
| 每条消息重新组装提示词 | 现有 handler 已经每次调 `setSystemPrompt` 刷新，无额外开销 |
| 摘要异步生成可能失败 | 失败不影响当前消息处理，下次回来会重试 |
| 并发消息可能导致重复摘要 | 串行锁保证同一用户同一时间只处理一条消息 |

### 7. Abort 处理

WebSocket 协议定义了 `{ type: 'abort' }` 消息和 `AbortHandler` 机制（`src/channels/websocket.ts`），
但当前是 dead code——没有任何地方把 WebSocket abort 连接到 SessionManager.abort()。

**重构方案：** 在无状态模型中，abort 通过持有当前 Agent 的引用来实现：

```typescript
// UserBot 持有当前正在处理请求的 Agent 引用
private currentAgent: Agent | null = null;

async handleIncomingMessage(message, context) {
  await this.enqueue(async () => {
    this.currentAgent = await createHealthAgent({...});
    try {
      await processMessage(this.currentAgent, message, context);
    } finally {
      this.currentAgent = null;
    }
  });
}

abort() {
  this.currentAgent?.abort();
}
```

串行锁保证 abort 时最多只有一个 Agent 在运行，不存在竞态问题。

**Abort 接线：** 在 `UserBot.addChannel()` 中注册 abort 回调：

```typescript
async addChannel(channel: ChannelAdapter) {
  // 注册消息处理
  channel.onMessage(async (message, context) => { ... });

  // 注册 abort 处理（WebSocket 等支持 abort 的通道）
  if ('onAbort' in channel) {
    (channel as any).onAbort(() => this.abort());
  }

  await channel.start();
  // ...
}
```

这样当 WebSocket 客户端发送 `{ type: 'abort' }` 时，会调用到 `UserBot.abort()`，
进而调用当前 Agent 的 `abort()`。
