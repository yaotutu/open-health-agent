import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { ChannelMessage, ChannelResponse, ChannelStreamChunk } from '../infrastructure/message-bus/types.js';
import type { SessionManager } from './session/types.js';
import type { Message } from '../infrastructure/storage/session-store.js';
import { logger } from '../infrastructure/logger.js';

export interface MessageHandlerOptions {
  sessionManager: SessionManager;
}

export interface MessageHandler {
  handle(message: ChannelMessage): Promise<ChannelResponse>;
  handleStream(
    message: ChannelMessage, 
    onChunk: (chunk: ChannelStreamChunk) => void
  ): Promise<void>;
}

/**
 * 创建统一消息处理器
 * 所有通道的消息都通过这里处理，与通道类型无关
 */
export const createMessageHandler = (options: MessageHandlerOptions): MessageHandler => {
  const { sessionManager } = options;

  /**
   * 处理Agent事件并转换为文本
   */
  const processAgentEvents = (events: AgentEvent[]): string => {
    let response = '';

    for (const event of events) {
      switch (event.type) {
        case 'message_end': {
          const msg = event.message;
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text') {
                response += (block as { text: string }).text;
              }
            }
          }
          break;
        }
        case 'tool_execution_end': {
          if (event.isError) {
            response += `\n[工具执行错误: ${JSON.stringify(event.result)}]`;
          }
          break;
        }
      }
    }

    return response;
  };

  /**
   * 从 Agent 事件中提取助手响应文本
   */
  const extractAssistantText = (events: AgentEvent[]): string => {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const msg = event.message;
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              return (block as { text: string }).text;
            }
          }
        }
      }
    }
    return '';
  };

  /**
   * 处理单条消息（非流式）
   */
  const handle = async (message: ChannelMessage): Promise<ChannelResponse> => {
    const { userId, content } = message;

    logger.info('[handler] processing message userId=%s channel=%s', userId, message.channel);

    const session = sessionManager.getOrCreate(userId);
    const events: AgentEvent[] = [];

    const unsubscribe = session.agent.subscribe((event) => {
      events.push(event);
    });

    try {
      // 1. 保存用户消息
      const userMessage: Message = {
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      await sessionManager.saveMessage(userId, userMessage);

      // 2. 调用 Agent
      await session.agent.prompt(content);

      // 3. 提取响应并保存
      const responseText = processAgentEvents(events);
      const assistantText = extractAssistantText(events);
      if (assistantText) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: assistantText,
          timestamp: Date.now(),
        };
        await sessionManager.saveMessage(userId, assistantMessage);
      }

      return {
        content: responseText || '处理完成',
        done: true,
      };
    } catch (err) {
      logger.error('[handler] error processing message: %s', (err as Error).message);
      return {
        content: `处理出错: ${(err as Error).message}`,
        done: true,
      };
    } finally {
      unsubscribe();
    }
  };

  /**
   * 处理流式消息
   */
  const handleStream = async (
    message: ChannelMessage,
    onChunk: (chunk: ChannelStreamChunk) => void
  ): Promise<void> => {
    const { userId, content } = message;

    logger.info('[handler] processing stream userId=%s channel=%s', userId, message.channel);

    const session = sessionManager.getOrCreate(userId);
    const events: AgentEvent[] = [];
    let buffer = '';

    const unsubscribe = session.agent.subscribe((event) => {
      events.push(event);
      switch (event.type) {
        case 'message_update': {
          const msg = event.message;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const content = (msg as any)?.content;
          if (msg?.role === 'assistant' && typeof content === 'string') {
            const newText = content.slice(buffer.length);
            if (newText) {
              buffer = content;
              onChunk({ content: newText, done: false });
            }
          }
          break;
        }
        case 'message_end': {
          onChunk({ content: '', done: true });
          break;
        }
      }
    });

    try {
      // 1. 保存用户消息
      const userMessage: Message = {
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      await sessionManager.saveMessage(userId, userMessage);

      // 2. 调用 Agent
      await session.agent.prompt(content);

      // 3. 提取响应并保存
      const assistantText = extractAssistantText(events);
      if (assistantText) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: assistantText,
          timestamp: Date.now(),
        };
        await sessionManager.saveMessage(userId, assistantMessage);
      }
    } catch (err) {
      logger.error('[handler] stream error: %s', (err as Error).message);
      onChunk({ content: `\n[错误: ${(err as Error).message}]`, done: true });
    } finally {
      unsubscribe();
    }
  };

  return {
    handle,
    handleStream,
  };
};
