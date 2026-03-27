/**
 * 健康助手Agent - 应用入口
 * 支持多通道（WebSocket、Telegram等）
 */
import http from 'http';
import { config } from './config/index.js';
import { createFileStorage } from './infrastructure/storage/file-storage.js';
import { createSessionStore } from './infrastructure/storage/session-store.js';
import { createSessionManager } from './application/session/manager.js';
import { createMessageHandler } from './application/message-handler.js';
import { createHealthAgent } from './application/agent/factory.js';
import { createWebSocketChannel } from './channels/websocket/server.js';
import { logger } from './infrastructure/logger.js';

// 关闭超时时间
const SHUTDOWN_TIMEOUT = 10000; // 10秒

async function main() {
  logger.info('[app] starting health advisor agent...');

  // 1. 基础设施层 - 存储初始化
  const storage = createFileStorage(config.server.workspacePath);
  const sessionStore = createSessionStore(config.server.workspacePath);

  // 2. 应用层 - Agent工厂（支持历史消息）
  const createAgent = (messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
    createHealthAgent({ storage, messages });

  // 3. 会话管理器（集成存储）
  const sessionManager = createSessionManager({
    createAgent,
    sessionStore,
  });
  
  // 4. 消息处理器（通道无关）
  const messageHandler = createMessageHandler({ sessionManager });

  // 5. 创建HTTP服务器
  const server = http.createServer(async (req, res) => {
    // 健康检查
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        sessions: sessionManager.list().length,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // 静态文件服务（简化版）
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      let filePath = req.url === '/' ? '/index.html' : req.url!;
      const fullPath = path.join(process.cwd(), 'public', filePath);
      
      // 防止目录遍历
      if (!fullPath.startsWith(path.join(process.cwd(), 'public'))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(fullPath);
      const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
      }[ext] || 'application/octet-stream';

      const content = await fs.readFile(fullPath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  // 6. 创建并启动WebSocket通道
  const wsChannel = createWebSocketChannel({ 
    server, 
    path: '/ws' 
  });
  
  // 设置消息处理器
  wsChannel.onMessage(async (message) => {
    return await messageHandler.handle(message);
  });
  
  await wsChannel.start();

  // 7. 启动服务器
  server.listen(config.server.port, () => {
    logger.info('[app] server started port=%d', config.server.port);
    logger.info('[app] websocket ws://localhost:%d/ws', config.server.port);
    logger.info('[app] health check http://localhost:%d/health', config.server.port);
    logger.info('[app] workspace path=%s', config.server.workspacePath);
  });

  // 8. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info('[app] received %s, shutting down...', signal);

    const timeout = setTimeout(() => {
      logger.warn('[app] shutdown timeout (%dms), forcing exit', SHUTDOWN_TIMEOUT);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
      // 1. 停止接收新连接
      await wsChannel.stop();

      // 2. 关闭 HTTP 服务器
      server.close();

      // 3. 关闭存储
      await storage.close?.();
      await sessionStore.close();

      clearTimeout(timeout);
      logger.info('[app] shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('[app] shutdown error: %s', (err as Error).message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('[app] fatal error: %s', err.message);
  process.exit(1);
});
