# 无状态 Agent 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SessionManager 有状态架构重构为无状态 Agent 模式，每次消息从 DB 加载上下文、创建临时 Agent、用完即弃。

**Architecture:** 删除 SessionManager 的内存缓存和 TTL 定时器，改为每条消息创建临时 Agent。用 Promise 链串行锁保证同一用户的消息按顺序处理。摘要触发从"session 过期"改为"用户发消息时检查间隔"。

**Tech Stack:** TypeScript, Bun runtime, Drizzle ORM (SQLite), pi-agent-core

**Design Spec:** `docs/superpowers/specs/2026-04-02-stateless-agent-design.md`

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `src/store/messages.ts` | 新增 `getLastMessageTimestamp` 方法 |
| 修改 | `src/config.ts` | 新增摘要间隔阈值配置 |
| 重写 | `src/session/manager.ts` | 删除 SessionManager，保留 `generateConversationSummary` |
| 修改 | `src/session/index.ts` | 更新导出 |
| 重写 | `src/channels/handler.ts` | 接收 `createAgent` 工厂，加惰性摘要 + 兜底回复 |
| 重写 | `src/bot/user-bot.ts` | 删除 session，加串行锁，用临时 Agent |
| 不改 | `src/agent/factory.ts` | `createHealthAgent` 接口不变 |
| 不改 | `src/main.ts` | 调用接口不变 |

---

### Task 1: 新增 `getLastMessageTimestamp` 到 MessageStore

**Files:**
- Modify: `src/store/messages.ts:33-38`（在 `return` 之前添加新方法）

- [ ] **Step 1: 添加 `getLastMessageTimestamp` 方法**

在 `src/store/messages.ts` 的 `createMessageStore` 函数中，`return` 之前添加：

```typescript
  /**
   * 获取用户最后一条消息的时间戳
   * 用于惰性摘要触发：判断用户是否长时间未活跃
   * @param userId 用户ID
   * @returns 最后一条消息的时间戳，无消息返回 null
   */
  const getLastMessageTimestamp = async (userId: string): Promise<number | null> => {
    const result = await db.select({ timestamp: messages.timestamp })
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.timestamp))
      .limit(1);
    return result[0]?.timestamp ?? null;
  };

  return { getMessages, appendMessage, clear, getLastMessageTimestamp };
```

- [ ] **Step 2: 更新 MessageStore 类型导出**

`return` 语句已更新，`MessageStore` 类型自动包含新方法，无需额外操作。

- [ ] **Step 3: 运行 typecheck 验证**

Run: `bun run typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add src/store/messages.ts
git commit -m "feat: add getLastMessageTimestamp to MessageStore"
```

---

### Task 2: 新增摘要间隔配置到 config

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: 添加 `session.summaryIntervalMs` 配置**

在 `src/config.ts` 中添加新的配置节：

```typescript
  /** 会话相关配置 */
  session: {
    /** 惰性摘要触发间隔（毫秒）：用户消息间隔超过此值时生成上一段对话摘要，默认 4 小时 */
    summaryIntervalMs: Number(process.env.SESSION_SUMMARY_INTERVAL_MS) || 4 * 60 * 60 * 1000,
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/config.ts
git commit -m "feat: add session.summaryIntervalMs config for lazy summary"
```

---

### Task 3: 简化 `session/manager.ts`

**Files:**
- Rewrite: `src/session/manager.ts`
- Modify: `src/session/index.ts`

- [ ] **Step 1: 重写 `src/session/manager.ts`**

删除整个 `SessionManager`、`Session`、`createSessionManager`、`CreateSessionManagerOptions`。只保留 `generateConversationSummary`：

```typescript
import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { Context } from '@mariozechner/pi-ai';
import type { Message } from '../store';
import { config } from '../config';

/**
 * 使用 LLM 生成对话摘要
 * 提取最近对话的关键内容，压缩为一段简短的摘要
 * @param messages 用户的对话消息列表
 * @returns 生成的对话摘要文本
 */
export async function generateConversationSummary(messages: Message[]): Promise<string> {
  // 取最近20条消息，避免过长输入
  const recent = messages.slice(-20);

  // 构造对话内容文本，将消息列表拼接为可读的对话记录
  const conversationText = recent
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');

  // 获取 LLM 模型实例
  const model = getModel(
    config.llm.provider as any,
    config.llm.model as any
  );

  // 构建 LLM 请求上下文
  const context: Context = {
    systemPrompt: '你是一个对话摘要生成器。请用中文将以下健康顾问对话压缩为2-3句话的摘要，保留关键的健康信息、用户提到的问题和建议。只输出摘要内容，不要其他文字。',
    messages: [{
      role: 'user',
      content: conversationText,
      timestamp: Date.now(),
    }],
  };

  // 使用 streamSimple 获取 LLM 响应
  const stream = streamSimple(model, context);
  let summary = '';
  for await (const event of stream) {
    if (event.type === 'done' && event.message) {
      summary = event.message.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');
    }
  }
  return summary || '对话摘要生成失败';
}
```

- [ ] **Step 2: 更新 `src/session/index.ts` 导出**

```typescript
export { generateConversationSummary } from './manager';
```

- [ ] **Step 3: 运行 typecheck**

此时 typecheck 会报错，因为 `user-bot.ts` 和 `handler.ts` 还在引用已删除的类型。这是预期的，后续任务会修复。

Run: `bun run typecheck`
Expected: 类型错误（`SessionManager`、`Session` 等未找到）— 这是预期的

- [ ] **Step 4: Commit**

```bash
git add src/session/manager.ts src/session/index.ts
git commit -m "refactor: remove SessionManager, keep generateConversationSummary"
```

---

### Task 4: 重写 `channels/handler.ts`

**Files:**
- Rewrite: `src/channels/handler.ts`

- [ ] **Step 1: 重写 handler**

```typescript
import type { Agent } from '@mariozechner/pi-agent-core';
import type { Store, Message } from '../store';
import type { ChannelMessage, ChannelContext } from './types';
import { logger } from '../infrastructure/logger';
import { withTimeContext, formatDate } from '../infrastructure/time';
import { assembleSystemPrompt } from '../prompts/assembler';
import { extractAssistantText } from '../agent/event-utils';
import { generateConversationSummary } from '../session';
import { config } from '../config';

export interface CreateMessageHandlerOptions {
  /** Agent 工厂：接收 userId 和历史消息，返回临时 Agent */
  createAgent: (userId: string, messages: Message[]) => Promise<Agent>;
  store: Store;
}

/**
 * 惰性摘要检查
 * 检查用户距最后一条消息的时间间隔，超过阈值则异步生成摘要
 * fire-and-forget：不阻塞当前消息处理，失败也不影响
 */
function maybeGenerateSummary(store: Store, userId: string): void {
  if (config.testMode) return;

  // fire-and-forget：不 await
  (async () => {
    try {
      const lastTimestamp = await store.messages.getLastMessageTimestamp(userId);
      if (lastTimestamp === null) return;

      const elapsed = Date.now() - lastTimestamp;
      if (elapsed < config.session.summaryIntervalMs) return;

      // 间隔足够长，生成摘要
      const messages = await store.messages.getMessages(userId);
      if (messages.length < 4) return;

      const summary = await generateConversationSummary(messages);
      await store.summary.save(userId, {
        summary,
        messageCount: messages.length,
        startTimestamp: messages[0].timestamp,
        endTimestamp: messages[messages.length - 1].timestamp,
      });
      logger.info('[handler] summary generated userId=%s count=%d', userId, messages.length);
    } catch (err) {
      logger.error('[handler] summary failed userId=%s error=%s', userId, (err as Error).message);
    }
  })();
}

export const createMessageHandler = (options: CreateMessageHandlerOptions) => {
  const { createAgent, store } = options;

  return async (message: ChannelMessage, context: ChannelContext): Promise<void> => {
    const { userId, content } = message;
    logger.info('[handler] processing userId=%s channel=%s', userId, message.channel);

    try {
      // 1. 惰性摘要检查（fire-and-forget，不阻塞）
      maybeGenerateSummary(store, userId);

      // 2. 从 DB 加载历史消息
      const messages = config.testMode ? [] : await store.messages.getMessages(userId);

      // 3. 创建临时 Agent
      const agent = await createAgent(userId, messages);

      // 4. 订阅 message_end 事件捕获助手响应
      let assistantMessage: any = null;
      const unsubscribe = agent.subscribe((event) => {
        if (event.type === 'message_end' && event.message.role === 'assistant') {
          assistantMessage = event.message;
        }
      });

      try {
        // 5. 提取图片数据
        const images = message.images?.map(img => ({
          type: 'image' as const,
          data: img.data,
          mimeType: img.mimeType,
        }));
        const imageMetadata = message.images?.map(img => ({
          format: img.mimeType?.split('/')[1] || 'unknown',
          mimeType: img.mimeType,
        }));

        // 6. 保存用户消息到数据库
        await store.messages.appendMessage(userId, {
          role: 'user',
          content,
          timestamp: Date.now(),
          ...(imageMetadata ? { metadata: JSON.stringify({ images: imageMetadata }) } : {}),
        });

        // 7. 刷新动态上下文并设置提示词
        const updatedPrompt = await assembleSystemPrompt(store, userId);
        agent.setSystemPrompt(updatedPrompt);

        // 8. 调用 Agent
        const timedContent = withTimeContext(content);
        if (images && images.length > 0) {
          await agent.prompt(timedContent, images);
        } else {
          await agent.prompt(timedContent);
        }

        // 9. 提取响应并保存
        const assistantText = assistantMessage ? extractAssistantText(assistantMessage) : '';
        if (assistantText) {
          await store.messages.appendMessage(userId, {
            role: 'assistant',
            content: assistantText,
            timestamp: Date.now(),
          });
          if (!context.capabilities?.streaming) {
            await context.send(assistantText);
          }
        }
      } finally {
        unsubscribe();
      }
    } catch (err) {
      const errMsg = (err as Error).message;

      // abort 不是错误，静默处理
      if (errMsg?.includes('aborted')) {
        logger.info('[handler] request aborted userId=%s', userId);
        return;
      }

      // 其他错误：兜底回复，确保用户收到响应
      logger.error('[handler] error=%s', errMsg);
      const timestamp = formatDate(Date.now());
      try {
        await context.send(`抱歉，${timestamp} 处理时出了点问题，请稍后再试。`);
      } catch (sendErr) {
        logger.error('[handler] fallback send failed userId=%s error=%s', userId, (sendErr as Error).message);
      }
    }
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/channels/handler.ts
git commit -m "refactor: rewrite handler with createAgent factory, lazy summary, fallback reply"
```

---

### Task 5: 重写 `bot/user-bot.ts`

**Files:**
- Rewrite: `src/bot/user-bot.ts`

- [ ] **Step 1: 重写 UserBot**

```typescript
import type { Agent } from '@mariozechner/pi-agent-core';
import type { Agent } from '@mariozechner/pi-agent-core';
import { createHealthAgent } from '../agent';
import { extractAssistantText } from '../agent/event-utils';
import { createMessageHandler } from '../channels';
import type { ChannelAdapter, ChannelMessage, ChannelContext, DeliverableChannel } from '../channels';
import type { Store, Message } from '../store';
import type { CronService } from '../cron/service';
import { config } from '../config';
import { logger } from '../infrastructure/logger';
import { withTimeContext, formatDate } from '../infrastructure/time';

/**
 * 每用户独立运行单元（无状态版本）
 * 每条消息创建临时 Agent，用完即弃，不在内存中缓存状态
 * 通过 Promise 链串行锁保证同一用户的消息按顺序处理
 */
export class UserBot {
  readonly userId: string;

  private store: Store;
  private cronService?: CronService;
  private channels: Map<string, ChannelAdapter> = new Map();
  /** 支持主动推送的渠道列表（用于心跳、Cron 等场景） */
  private deliverableChannels: DeliverableChannel[] = [];
  /** 串行锁：保证同一用户的消息和 promptAndDeliver 按顺序执行 */
  private queue: Promise<void> = Promise.resolve();
  /** 当前正在运行的 Agent 引用（用于 abort） */
  private currentAgent: Agent | null = null;
  /** 消息处理器 */
  private messageHandler: (message: ChannelMessage, context: ChannelContext) => Promise<void>;

  /**
   * @param userId 用户ID
   * @param store 共享存储实例（数据通过 userId 天然隔离）
   * @param cronService 定时任务服务（可选）
   */
  constructor(
    userId: string,
    store: Store,
    cronService?: CronService,
  ) {
    this.userId = userId;
    this.store = store;
    this.cronService = cronService;

    // Agent 工厂：为这个用户创建临时 Agent
    const createAgent = async (uid: string, messages: Message[]) =>
      createHealthAgent({
        store,
        userId: uid,
        messages,
        channel: 'qq',
        cronService,
      });

    // 创建消息处理器（使用 createAgent 工厂，不依赖 SessionManager）
    this.messageHandler = createMessageHandler({ createAgent, store });
  }

  /**
   * 串行执行：保证同一用户的请求按顺序处理
   * 前一个请求完成后才开始下一个
   */
  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.queue;
    let resolve: () => void;
    this.queue = new Promise<void>(r => { resolve = r; });
    await prev;
    try {
      return await fn();
    } finally {
      resolve!();
    }
  }

  /**
   * 处理来自外部渠道的入站消息
   * WebSocket、QQ 等渠道收到消息后调用此方法
   */
  async handleIncomingMessage(message: ChannelMessage, context: ChannelContext): Promise<void> {
    await this.enqueue(() => this.messageHandler(message, context));
  }

  /**
   * 触发 Agent 处理消息并推送响应
   * 用于 Cron 定时任务、心跳等需要主动触发 Agent 的场景
   */
  async promptAndDeliver(message: string, deliver: boolean = true): Promise<string | null> {
    return this.enqueue(async () => {
      try {
        // 从 DB 加载历史消息
        const messages: Message[] = config.testMode ? [] : await this.store.messages.getMessages(this.userId);

        // 创建临时 Agent（传入 cronService，保持与 handler 创建的 Agent 一致）
        const agent = await createHealthAgent({
          store: this.store,
          userId: this.userId,
          messages,
          channel: 'qq',
          cronService: this.cronService,
        });

        this.currentAgent = agent;

        // 订阅 message_end 事件捕获助手响应
        let assistantMessage: any = null;
        const unsubscribe = agent.subscribe((event) => {
          if (event.type === 'message_end' && event.message.role === 'assistant') {
            assistantMessage = event.message;
          }
        });

        try {
          await agent.prompt(withTimeContext(message));
        } finally {
          unsubscribe();
          this.currentAgent = null;
        }

        const responseText = assistantMessage ? extractAssistantText(assistantMessage) : '';
        if (!responseText) {
          logger.warn('[user-bot] promptAndDeliver no response userId=%s', this.userId);
          return null;
        }

        if (deliver) {
          await this.store.messages.appendMessage(this.userId, {
            role: 'assistant',
            content: responseText,
            timestamp: Date.now(),
          });
          await this.sendToUser(responseText);
        }

        return responseText;
      } catch (err) {
        // 兜底回复：cron 任务失败也通知用户
        logger.error('[user-bot] promptAndDeliver failed userId=%s error=%s', this.userId, (err as Error).message);
        if (deliver) {
          const timestamp = formatDate(Date.now());
          try {
            await this.sendToUser(`抱歉，${timestamp} 处理时出了点问题，请稍后再试。`);
          } catch (sendErr) {
            logger.error('[user-bot] fallback send failed userId=%s error=%s', this.userId, (sendErr as Error).message);
          }
        }
        return null;
      }
    });
  }

  /**
   * 中止当前正在处理的请求
   * 通过串行锁保证同一时间最多只有一个 Agent
   */
  abort(): void {
    this.currentAgent?.abort();
  }

  /**
   * 添加渠道并启动监听
   */
  async addChannel(channel: ChannelAdapter): Promise<void> {
    // 注册消息处理回调（通过 handleIncomingMessage 走串行锁）
    channel.onMessage(async (message, context) => {
      const unifiedMessage = { ...message, userId: this.userId };
      await this.handleIncomingMessage(unifiedMessage, context);
    });

    // 注册 abort 处理（WebSocket 等支持 abort 的通道）
    if ('onAbort' in channel && typeof (channel as any).onAbort === 'function') {
      (channel as any).onAbort(() => this.abort());
    }

    // 启动渠道监听
    await channel.start();
    this.channels.set(channel.name, channel);

    // 如果是可主动推送的渠道，记录下来
    if ('sendToUser' in channel) {
      this.deliverableChannels.push(channel as DeliverableChannel);
    }

    logger.info('[user-bot] channel added userId=%s channel=%s', this.userId, channel.name);
  }

  /**
   * 向该用户主动推送消息
   */
  async sendToUser(text: string): Promise<boolean> {
    for (const channel of this.deliverableChannels) {
      try {
        const delivered = await channel.sendToUser(this.userId, text);
        if (delivered) {
          logger.info('[user-bot] delivered userId=%s channel=%s', this.userId, channel.name);
          return true;
        }
      } catch (err) {
        logger.error('[user-bot] send failed userId=%s channel=%s error=%s', this.userId, channel.name, (err as Error).message);
      }
    }
    return false;
  }

  /**
   * 停止所有渠道
   */
  async stop(): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.stop();
      } catch (err) {
        logger.error('[user-bot] stop channel failed userId=%s channel=%s error=%s', this.userId, channel.name, (err as Error).message);
      }
    }
    this.channels.clear();
    this.deliverableChannels = [];
    logger.info('[user-bot] stopped userId=%s', this.userId);
  }
}
```

- [ ] **Step 2: 运行 typecheck 验证所有改动**

Run: `bun run typecheck`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add src/bot/user-bot.ts
git commit -m "refactor: rewrite UserBot as stateless with serial lock and temp Agent"
```

---

### Task 6: 集成验证

**Files:**
- 可能需微调: `src/main.ts`（检查是否有破坏性变更）

- [ ] **Step 1: 检查 main.ts 是否需要修改**

`main.ts` 调用 `new UserBot(userId, store, cronService)` 和 `bot.promptAndDeliver()` — 构造函数签名和公开接口不变，无需修改。

Run: `grep -n "new UserBot\|promptAndDeliver\|handleIncomingMessage\|sendToUser\|stop\|addChannel" src/main.ts src/bot/bot-manager.ts`

确认所有调用点与新接口兼容。

- [ ] **Step 2: 运行完整 typecheck**

Run: `bun run typecheck`
Expected: 通过

- [ ] **Step 3: 启动服务做冒烟测试**

Run: `bun run dev`

验证：
- 服务正常启动
- WebSocket 连接正常
- 发送消息能收到回复
- 没有报错日志

- [ ] **Step 4: Commit**

如有微调：
```bash
git add -A
git commit -m "fix: adjust integration issues after stateless refactor"
```
