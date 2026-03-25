import http from 'http';
import { config } from 'dotenv';
import { createFileStorage } from '../storage/file-storage.js';
import { createHealthAgent } from '../agent/index.js';
import { createSessionManager } from './session.js';
import { createWebSocketHandler } from './websocket.js';
import { logger } from '../logger/index.js';

// 加载环境变量
config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || './workspace';

// 创建存储
const storage = createFileStorage(WORKSPACE_PATH);

// 创建会话管理器
const sessionManager = createSessionManager(() =>
  createHealthAgent({
    storage,
    provider: process.env.LLM_PROVIDER,
    model: process.env.LLM_MODEL,
  })
);

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessionManager.list().length }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// 创建 WebSocket 处理器
createWebSocketHandler(server, sessionManager);

// 启动服务器
server.listen(PORT, () => {
  logger.info('server', `HealthClaw server started on port ${PORT}`);
  logger.info('server', `WebSocket: ws://localhost:${PORT}/ws`);
  logger.info('server', `Health check: http://localhost:${PORT}/health`);
  logger.info('server', `Workspace: ${WORKSPACE_PATH}`);
});
