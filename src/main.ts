/**
 * 健康助手Agent - 应用入口
 * 支持多通道（WebSocket、Telegram等）
 */
import http from 'http';
import { config } from 'dotenv';
import { SERVER_CONFIG } from './config/index.js';
import { createFileStorage } from './infrastructure/storage/file-storage.js';
import { createSessionManager } from './application/session/manager.js';
import { createMessageHandler } from './application/message-handler.js';
import { createHealthAgent } from './application/agent/factory.js';
import { createWebSocketChannel } from './channels/websocket/server.js';
import { logger } from './infrastructure/logger.js';

// 加载环境变量
config();

async function main() {
  logger.info('[app] starting health advisor agent...');

  // 1. 基础设施层
  const storage = createFileStorage(SERVER_CONFIG.WORKSPACE_PATH);
  
  // 2. 应用层 - Agent工厂
  const createAgent = () => createHealthAgent({ storage });
  
  // 3. 会话管理器（按userId）
  const sessionManager = createSessionManager(createAgent);
  
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
  server.listen(SERVER_CONFIG.PORT, () => {
    logger.info('[app] server started port=%d', SERVER_CONFIG.PORT);
    logger.info('[app] websocket ws://localhost:%d/ws', SERVER_CONFIG.PORT);
    logger.info('[app] health check http://localhost:%d/health', SERVER_CONFIG.PORT);
    logger.info('[app] workspace path=%s', SERVER_CONFIG.WORKSPACE_PATH);
  });

  // 8. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info('[app] received %s, shutting down...', signal);
    
    await wsChannel.stop();
    server.close();
    await storage.close?.();
    
    logger.info('[app] shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('[app] fatal error: %s', err.message);
  process.exit(1);
});
