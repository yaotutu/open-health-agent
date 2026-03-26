import { WebSocketServer, WebSocket } from 'ws';
import type http from 'http';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { SessionManager } from './session.js';
import { logger } from '../logger/index.js';

// 客户端消息
interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
}

// 服务器消息
interface ServerMessage {
  type: 'event' | 'error' | 'done';
  event?: AgentEvent;
  error?: string;
}

// 发送消息给客户端
const sendMessage = (ws: WebSocket, msg: ServerMessage) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
};

// 记录 Agent 事件
const logAgentEvent = (event: AgentEvent) => {
  switch (event.type) {
    case 'agent_start':
      logger.debug('[agent] start');
      break;
    case 'agent_end':
      logger.debug('[agent] end messages=%d', event.messages.length);
      break;
    case 'turn_start':
      logger.debug('[agent] turn_start');
      break;
    case 'turn_end': {
      const toolCount = event.toolResults?.length || 0;
      logger.info('[agent] turn_end role=assistant tools=%d', toolCount);
      break;
    }
    case 'message_start':
      logger.debug('[agent] message_start role=%s', event.message?.role);
      break;
    case 'message_update':
      // 流式输出太频繁，不记录
      break;
    case 'message_end': {
      const msg = event.message;

      if (msg.role === 'user') {
        logger.debug('[agent] message_end role=user');
      } else if (msg.role === 'assistant') {
        const content = msg.content;
        let text = '';
        if (Array.isArray(content)) {
          const textBlock = content.find(c => c.type === 'text');
          text = (textBlock as { text?: string })?.text || '';
        }
        const usage = msg.usage;
        logger.info('[agent] message_end role=assistant text=%s... tokens=%d+%d',
          text.slice(0, 100),
          usage?.input || 0,
          usage?.output || 0
        );
      }
      break;
    }
    case 'tool_execution_start':
      logger.info('[tool] execute name=%s args=%j', event.toolName, event.args);
      break;
    case 'tool_execution_update': {
      const partial = JSON.stringify(event.partialResult).slice(0, 100);
      logger.debug('[tool] update name=%s partial=%s...', event.toolName, partial);
      break;
    }
    case 'tool_execution_end': {
      if (event.isError) {
        logger.error('[tool] error name=%s', event.toolName);
      } else {
        logger.info('[tool] end name=%s', event.toolName);
      }
      break;
    }
    default: {
      const _event: never = event;
      logger.debug('[agent] unhandled event type=%s', (_event as { type: string }).type);
    }
  }
};

// 处理客户端消息
const handleMessage = async (
  ws: WebSocket,
  msg: ClientMessage,
  sessionManager: SessionManager
) => {
  const sessionId = msg.sessionId || 'default';
  const session = sessionManager.getOrCreate(sessionId);

  switch (msg.type) {
    case 'prompt': {
      if (!msg.content) {
        sendMessage(ws, { type: 'error', error: 'Missing content' });
        return;
      }

      logger.info('[ws] processing prompt sessionId=%s', sessionId);

      const unsubscribe = session.agent.subscribe((event) => {
        logAgentEvent(event);
        sendMessage(ws, { type: 'event', event });
      });

      try {
        await session.agent.prompt(msg.content);
        sendMessage(ws, { type: 'done' });
      } catch (err) {
        logger.error('[ws] prompt error message=%s', (err as Error).message);
        sendMessage(ws, { type: 'error', error: (err as Error).message });
      } finally {
        unsubscribe();
      }
      break;
    }

    case 'abort':
      session.agent.abort();
      logger.info('[ws] aborted sessionId=%s', sessionId);
      break;

    case 'continue': {
      logger.info('[ws] continue sessionId=%s', sessionId);
      const unsubscribeContinue = session.agent.subscribe((event) => {
        logAgentEvent(event);
        sendMessage(ws, { type: 'event', event });
      });

      try {
        await session.agent.continue();
        sendMessage(ws, { type: 'done' });
      } catch (err) {
        logger.error('[ws] continue error message=%s', (err as Error).message);
        sendMessage(ws, { type: 'error', error: (err as Error).message });
      } finally {
        unsubscribeContinue();
      }
      break;
    }

    default:
      sendMessage(ws, { type: 'error', error: `Unknown message type` });
  }
};

// 创建 WebSocket 服务器
export const createWebSocketHandler = (
  server: http.Server,
  sessionManager: SessionManager
) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    logger.info('[ws] client connected ip=%s', clientIp);

    ws.on('message', async (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        logger.debug('[ws] received message type=%s sessionId=%s', msg.type, msg.sessionId || 'default');
        await handleMessage(ws, msg, sessionManager);
      } catch (err) {
        logger.error('[ws] failed to handle message error=%s', (err as Error).message);
        sendMessage(ws, { type: 'error', error: (err as Error).message });
      }
    });

    ws.on('close', () => {
      logger.info('[ws] client disconnected');
    });

    ws.on('error', (err) => {
      logger.error('[ws] error message=%s', err.message);
    });
  });

  return wss;
};
