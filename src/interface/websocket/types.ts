import type { AgentEvent } from '@mariozechner/pi-agent-core';

// 客户端消息类型
export interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
}

// 服务器消息类型
export interface ServerMessage {
  type: 'event' | 'error' | 'done';
  event?: AgentEvent;
  error?: string;
}
