import type { AgentEvent } from '@mariozechner/pi-agent-core';

export interface ChannelAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: MessageHandler): void;
}

export interface ChannelMessage {
  userId: string;
  content: string;
  channel: string;
  metadata?: Record<string, unknown>;
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
