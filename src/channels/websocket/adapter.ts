import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { ChannelAdapter, MessageHandler } from '../interface.js';
import type { ChannelMessage, ChannelResponse, ChannelStreamChunk } from '../../infrastructure/message-bus/types.js';
import type { ClientMessage, ServerMessage, WebSocketContext } from './types.js';
import { logger } from '../../infrastructure/logger.js';

interface Connection {
  ws: WebSocket;
  userId: string;
  connectionId: string;
}

export class WebSocketChannelAdapter implements ChannelAdapter {
  readonly name = 'websocket';
  private connections = new Map<string, Connection>();
  private messageHandler?: MessageHandler;

  constructor(private wss: WebSocketServer) {}

  async start(): Promise<void> {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const clientIp = req.socket.remoteAddress || 'unknown';
      const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      
      logger.info('[ws] client connected ip=%s connectionId=%s', clientIp, connectionId);

      const messageHandler = (data: Buffer) => {
        this.handleIncomingMessage(ws, data, connectionId).catch(err => {
          logger.error('[ws] message handler error: %s', (err as Error).message);
          this.sendMessage(ws, { type: 'error', error: (err as Error).message });
        });
      };

      ws.on('message', messageHandler);

      ws.on('close', () => {
        logger.info('[ws] client disconnected connectionId=%s', connectionId);
        this.connections.delete(connectionId);
        ws.off('message', messageHandler);
      });

      ws.on('error', (err: Error) => {
        logger.error('[ws] error connectionId=%s message=%s', connectionId, err.message);
      });
    });
  }

  async stop(): Promise<void> {
    for (const [id, conn] of this.connections) {
      conn.ws.close();
      this.connections.delete(id);
    }
    this.wss.close();
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async send(response: ChannelResponse, context: unknown): Promise<void> {
    const ctx = context as WebSocketContext;
    const conn = this.connections.get(ctx.connectionId);
    if (!conn) {
      logger.warn('[ws] connection not found: %s', ctx.connectionId);
      return;
    }

    const msg: ServerMessage = {
      type: 'event',
      event: {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: response.content }],
        },
      } as any,
    };

    this.sendMessage(conn.ws, msg);

    if (response.done) {
      this.sendMessage(conn.ws, { type: 'done' });
    }
  }

  async sendStream(chunk: ChannelStreamChunk, context: unknown): Promise<void> {
    const ctx = context as WebSocketContext;
    const conn = this.connections.get(ctx.connectionId);
    if (!conn) return;

    const msg: ServerMessage = chunk.done
      ? { type: 'done' }
      : {
          type: 'event',
          event: {
            type: 'message_update',
            message: {
              role: 'assistant',
              content: chunk.content,
            },
          } as any,
        };

    this.sendMessage(conn.ws, msg);
  }

  private async handleIncomingMessage(
    ws: WebSocket,
    data: Buffer,
    connectionId: string
  ): Promise<void> {
    if (!this.messageHandler) {
      throw new Error('Message handler not set');
    }

    const clientMsg: ClientMessage = JSON.parse(data.toString());
    logger.debug('[ws] received message type=%s connectionId=%s', clientMsg.type, connectionId);

    const userId = clientMsg.sessionId || 'default';
    
    let conn = this.connections.get(connectionId);
    if (!conn) {
      conn = { ws, userId, connectionId };
      this.connections.set(connectionId, conn);
    }

    const channelMsg: ChannelMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      content: clientMsg.content || '',
      timestamp: new Date(),
      channel: 'websocket',
      metadata: { connectionId, messageType: clientMsg.type },
    };

    switch (clientMsg.type) {
      case 'prompt': {
        const response = await this.messageHandler(channelMsg);
        await this.send(response, { connectionId });
        break;
      }
      case 'continue': {
        const response = await this.messageHandler({
          ...channelMsg,
          content: '',
        });
        await this.send(response, { connectionId });
        break;
      }
      case 'abort': {
        logger.info('[ws] abort requested connectionId=%s', connectionId);
        break;
      }
      default:
        this.sendMessage(ws, { type: 'error', error: 'Unknown message type' });
    }
  }

  private sendMessage(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
