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

      logger.info('ws', `Processing prompt for session ${sessionId}`);

      const unsubscribe = session.agent.subscribe((event) => {
        sendMessage(ws, { type: 'event', event });
      });

      try {
        await session.agent.prompt(msg.content);
        sendMessage(ws, { type: 'done' });
      } catch (err) {
        logger.error('ws', 'Prompt error', err as Error);
        sendMessage(ws, { type: 'error', error: (err as Error).message });
      } finally {
        unsubscribe();
      }
      break;
    }

    case 'abort':
      session.agent.abort();
      logger.info('ws', `Aborted session ${sessionId}`);
      break;

    case 'continue': {
      logger.info('ws', `Continue session ${sessionId}`);
      const unsubscribeContinue = session.agent.subscribe((event) => {
        sendMessage(ws, { type: 'event', event });
      });

      try {
        await session.agent.continue();
        sendMessage(ws, { type: 'done' });
      } catch (err) {
        logger.error('ws', 'Continue error', err as Error);
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
    logger.info('ws', `Client connected from ${clientIp}`);

    ws.on('message', async (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        logger.debug('ws', 'Received message', msg);
        await handleMessage(ws, msg, sessionManager);
      } catch (err) {
        logger.error('ws', 'Failed to handle message', err as Error);
        sendMessage(ws, { type: 'error', error: (err as Error).message });
      }
    });

    ws.on('close', () => {
      logger.info('ws', 'Client disconnected');
    });

    ws.on('error', (err) => {
      logger.error('ws', 'WebSocket error', err);
    });
  });

  return wss;
};
