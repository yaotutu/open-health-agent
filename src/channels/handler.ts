import type { Agent } from '@mariozechner/pi-agent-core';
import type { Store, Message } from '../store';
import type { ChannelMessage, ChannelContext } from './types';
import { createLogger } from '../infrastructure/logger';
const log = createLogger('handler');
import { withTimeContext, formatDate } from '../infrastructure/time';
import { assembleSystemPrompt } from '../prompts/assembler';
import { extractAssistantText, extractToolImages } from '../agent/event-utils';
import { generateConversationSummary } from '../session';
import { consolidateMemories } from '../session/consolidate';
import { config } from '../config';

export interface CreateMessageHandlerOptions {
  /** Agent 工厂：接收 userId 和历史消息，返回临时 Agent */
  createAgent: (userId: string, messages: Message[]) => Promise<Agent>;
  /** Agent 创建后的回调，用于外部跟踪当前活跃的 Agent（如 abort 支持） */
  onAgentCreated?: (agent: Agent) => void;
  /** Agent 处理完成后的回调，用于清理外部引用 */
  onAgentDone?: () => void;
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
      log.info('summary generated userId=%s count=%d', userId, messages.length);
    } catch (err) {
      log.error('summary failed userId=%s error=%s', userId, (err as Error).message);
    }
  })();
}

/**
 * 每轮对话结束后异步执行记忆巩固
 * 将最近对话和现有记忆发送给独立的 LLM 调用，让 LLM 判断是否需要新增、更新或删除记忆
 * 完全隔离：不使用 Agent 实例，不影响对话上下文
 * fire-and-forget：不阻塞用户收到回复，失败也不影响
 */
function runMemoryConsolidation(store: Store, userId: string, messages: Message[]): void {
  if (config.testMode) return;

  // fire-and-forget：不 await
  (async () => {
    try {
      const existingMemories = await store.memory.getAll(userId);
      await consolidateMemories(store, userId, messages, existingMemories);
    } catch (err) {
      log.error('consolidation failed userId=%s error=%s', userId, (err as Error).message);
    }
  })();
}

export const createMessageHandler = (options: CreateMessageHandlerOptions) => {
  const { createAgent, onAgentCreated, onAgentDone, store } = options;

  return async (message: ChannelMessage, context: ChannelContext): Promise<void> => {
    const { userId, content } = message;

    try {
      // 1. 惰性摘要检查（fire-and-forget，不阻塞）
      maybeGenerateSummary(store, userId);

      // 2. 从 DB 加载历史消息
      const messages = config.testMode ? [] : await store.messages.getMessages(userId);

      // 3. 创建临时 Agent
      const agent = await createAgent(userId, messages);
      onAgentCreated?.(agent);

      // 4. 订阅事件：捕获完整响应 + 流式转发 text_delta + 拦截工具图片
      let assistantMessage: any = null;
      const isStreaming = !!context.capabilities?.streaming;
      const unsubscribe = agent.subscribe((event) => {
        if (event.type === 'message_end' && event.message.role === 'assistant') {
          assistantMessage = event.message;
        }
        // 流式：将 text_delta 增量转发到通道（fire-and-forget，不阻塞事件循环）
        if (isStreaming && event.type === 'message_update') {
          const assistantEvent = (event as any).assistantMessageEvent;
          if (assistantEvent?.type === 'text_delta' && assistantEvent.delta) {
            context.sendStream?.(assistantEvent.delta, false).catch((err: Error) => {
              log.error('stream delta failed error=%s', err.message);
            });
          }
        }
        // 工具执行完成：检查是否包含图片（如 generate_chart），通过通道发送
        if (event.type === 'tool_execution_end') {
          const { toolName, result } = event as any;
          const images = extractToolImages(result);
          if (images.length > 0) {
            for (const img of images) {
              context.sendImage?.(img.data, img.mimeType).catch((err: Error) => {
                log.error('tool image send failed tool=%s error=%s', toolName, err.message);
              });
            }
            log.debug('tool images sent tool=%s count=%d', toolName, images.length);
          }
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

        // 8. 通知通道开始处理（如微信"正在输入..."指示器）
        context.sendTyping?.().catch(() => {});

        // 9. 调用 Agent
        const timedContent = withTimeContext(content);
        if (images && images.length > 0) {
          await agent.prompt(timedContent, images);
        } else {
          await agent.prompt(timedContent);
        }

        // 10. 提取响应并保存
        const assistantText = assistantMessage ? extractAssistantText(assistantMessage) : '';
        if (assistantText) {
          await store.messages.appendMessage(userId, {
            role: 'assistant',
            content: assistantText,
            timestamp: Date.now(),
          });
          if (isStreaming) {
            // 流式通道：发送最终 done 块，结束打字机效果
            await context.sendStream?.('', true).catch((err: Error) => {
              log.error('stream end failed error=%s', err.message);
            });
          } else {
            // 非流式通道：发送完整响应
            await context.send(assistantText);
          }
        }

        // 11. 记忆巩固（fire-and-forget，不阻塞）
        // 每轮对话结束后，独立调用 LLM 审查对话并更新记忆
        const allMessages = await store.messages.getMessages(userId);
        runMemoryConsolidation(store, userId, allMessages);
      } finally {
        unsubscribe();
        onAgentDone?.();
      }
    } catch (err) {
      const errMsg = (err as Error).message;

      // abort 不是错误，静默处理
      if (errMsg?.includes('aborted')) {
        log.info('request aborted userId=%s', userId);
        return;
      }

      // 其他错误：兜底回复，确保用户收到响应
      log.error('error userId=%s error=%s', userId, errMsg);
      const timestamp = formatDate(Date.now());
      try {
        await context.send(`抱歉，${timestamp} 处理时出了点问题，请稍后再试。`);
      } catch (sendErr) {
        log.error('fallback send failed userId=%s error=%s', userId, (sendErr as Error).message);
      }
    }
  };
};
