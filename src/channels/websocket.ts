import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ChannelAdapter, MessageHandler, ChannelMessage, ChannelContext, ClientMessage, ServerMessage } from './types';
import { logger } from '../infrastructure/logger';

interface Connection {
  ws: WebSocket;
  userId: string;
}

export interface WebSocketChannelOptions {
  server: http.Server;
  path?: string;
}

export class WebSocketChannel implements ChannelAdapter {
  readonly name = 'websocket';
  private wss: WebSocketServer;
  private connections = new Map<string, Connection>();
  private messageHandler?: MessageHandler;

  constructor(options: WebSocketChannelOptions) {
    const { server, path = '/ws' } = options;
    this.wss = new WebSocketServer({ server, path });
  }

  async start(): Promise<void> {
    this.wss.on('connection', (ws: WebSocket) => {
      const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      logger.info('[ws] client connected connectionId=%s', connectionId);

      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data, connectionId).catch(err => {
          logger.error('[ws] error=%s', (err as Error).message);
          this.sendToWs(ws, { type: 'error', error: (err as Error).message });
        });
      });

      ws.on('close', () => {
        logger.info('[ws] client disconnected connectionId=%s', connectionId);
        this.connections.delete(connectionId);
      });

      ws.on('error', (err: Error) => {
        logger.error('[ws] error=%s', err.message);
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

  private async handleMessage(ws: WebSocket, data: Buffer, connectionId: string): Promise<void> {
    if (!this.messageHandler) {
      throw new Error('Message handler not set');
    }

    let clientMsg: ClientMessage;
    try {
      clientMsg = JSON.parse(data.toString()) as ClientMessage;
    } catch (err) {
      logger.error('[ws] invalid JSON connectionId=%s', connectionId);
      this.sendToWs(ws, { type: 'error', error: 'Invalid JSON format' });
      return;
    }

    const userId = clientMsg.sessionId || 'default';

    this.connections.set(connectionId, { ws, userId });

    const channelMsg: ChannelMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      content: clientMsg.content || '',
      timestamp: new Date(),
      channel: 'websocket',
      metadata: { connectionId, messageType: clientMsg.type },
    };

    const context: ChannelContext = {
      send: async (text: string) => {
        // Create a properly typed message_end event
        const messageEndEvent: ServerMessage['event'] = {
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text }],
            model: '',
            provider: '',
            api: '',
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
          },
        };
        this.sendToWs(ws, {
          type: 'event',
          event: messageEndEvent,
        });
        this.sendToWs(ws, { type: 'done' });
      },
      sendStream: async (text: string, done: boolean) => {
        if (done) {
          this.sendToWs(ws, { type: 'done' });
        } else {
          // Create a properly typed message_update event
          const messageUpdateEvent: ServerMessage['event'] = {
            type: 'message_update',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text }],
              model: '',
              provider: '',
              api: '',
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
              stopReason: 'stop',
              timestamp: Date.now(),
            },
            assistantMessageEvent: {
              type: 'text_delta',
              contentIndex: 0,
              delta: text,
              partial: {
                role: 'assistant',
                content: [{ type: 'text', text }],
                model: '',
                provider: '',
                api: '',
                usage: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
                stopReason: 'stop',
                timestamp: Date.now(),
              },
            },
          };
          this.sendToWs(ws, {
            type: 'event',
            event: messageUpdateEvent,
          });
        }
      },
    };

    if (clientMsg.type === 'prompt' || clientMsg.type === 'continue') {
      await this.messageHandler(channelMsg, context);
    } else if (clientMsg.type === 'abort') {
      logger.info('[ws] abort requested connectionId=%s', connectionId);
    }
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

export const createWebSocketChannel = (options: WebSocketChannelOptions): WebSocketChannel => {
  return new WebSocketChannel(options);
};
