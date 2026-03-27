import type { AgentEvent } from '@mariozechner/pi-agent-core';

/**
 * 客户端发送的消息
 */
export interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
}

/**
 * 服务器发送的消息
 */
export interface ServerMessage {
  type: 'event' | 'error' | 'done';
  event?: AgentEvent;
  error?: string;
}

/**
 * WebSocket连接上下文
 * 用于send方法识别连接
 */
export interface WebSocketContext {
  connectionId: string;
}
