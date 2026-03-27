import http from 'http';
import { WebSocketServer } from 'ws';
import { WebSocketChannelAdapter } from './adapter.js';
import { logger } from '../../infrastructure/logger.js';

export interface WebSocketServerOptions {
  server: http.Server;
  path?: string;
}

export const createWebSocketChannel = (options: WebSocketServerOptions): WebSocketChannelAdapter => {
  const { server, path = '/ws' } = options;

  const wss = new WebSocketServer({ server, path });

  logger.info('[ws] server created path=%s', path);

  const adapter = new WebSocketChannelAdapter(wss);

  return adapter;
};
