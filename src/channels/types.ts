import type { AgentEvent } from '@mariozechner/pi-agent-core';

export interface ChannelAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: MessageHandler): void;
}

/**
 * 通道接收到的消息（通道无关的统一格式）
 */
export interface ChannelMessage {
  /** 消息唯一ID */
  id: string;
  /** 用户ID（跨通道统一标识） */
  userId: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: Date;
  /** 原始通道标识 */
  channel: string;
  /** 通道特定的额外数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 返回给通道的响应
 */
export interface ChannelResponse {
  /** 响应内容 */
  content: string;
  /** 是否结束对话 */
  done?: boolean;
  /** 额外数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 流式响应块（用于打字机效果）
 */
export interface ChannelStreamChunk {
  /** 内容块 */
  content: string;
  /** 是否最后一个块 */
  done: boolean;
}

export interface ChannelContext {
  send(text: string): Promise<void>;
  sendStream?(text: string, done: boolean): Promise<void>;
}

export type MessageHandler = (
  message: ChannelMessage,
  context: ChannelContext
) => Promise<void>;

// WebSocket 特有类型
export interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
}

export interface ServerMessage {
  type: 'event' | 'error' | 'done';
  event?: AgentEvent;
  error?: string;
}
