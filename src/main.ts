import 'dotenv/config';
import http from 'http';
import { config } from './config';
import { Store } from './store';
import { createHealthAgent } from './agent';
import { createSessionManager, generateConversationSummary } from './session';
import { createMessageHandler, createWebSocketChannel, createQQChannel } from './channels';
import type { ChannelAdapter } from './channels';
import { startHeartbeatScheduler } from './heartbeat';
import { logger, dbLogWriter } from './infrastructure/logger';

async function main() {
  logger.info('[app] starting health advisor agent...');
  if (config.testMode) logger.info('[app] TEST_MODE enabled: no history, no summaries');

  // 1. 初始化存储
  const store = new Store(config.dbPath);
  // 将日志存储注入 logger，之后所有日志将写入数据库
  dbLogWriter.init(store.logs);
  logger.info('[app] database initialized path=%s', config.dbPath);

  // 2. 创建 Agent 工厂（异步函数，因为需要查询用户档案）
  const createAgent = async (userId: string, messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
    createHealthAgent({ store, userId, messages });

  // 3. 会话管理（包含过期时的对话摘要生成回调）
  const sessions = createSessionManager({
    createAgent,
    store,
    noHistory: config.testMode,
    /** 会话过期时自动生成对话摘要并保存到数据库（测试模式下跳过） */
    onSessionExpired: config.testMode ? undefined : async (userId: string) => {
      try {
        const messages = await store.messages.getMessages(userId);
        // 至少需要2轮对话（4条消息）才生成摘要
        if (messages.length < 4) return;

        const summary = await generateConversationSummary(messages);
        await store.summary.save(userId, {
          summary,
          messageCount: messages.length,
          startTimestamp: messages[0].timestamp,
          endTimestamp: messages[messages.length - 1].timestamp,
        });
        logger.info('[main] summary generated userId=%s count=%d', userId, messages.length);
      } catch (err) {
        logger.error('[main] summary generation failed userId=%s error=%s', userId, (err as Error).message);
      }
    },
  });

  // 4. 消息处理器
  const handleMessage = createMessageHandler({ sessions, store });

  // 5. 收集所有通道（用于关闭）
  const channels: ChannelAdapter[] = [];

  // 6. 创建 HTTP 服务器
  const server = http.createServer();

  // 7. 启动 WebSocket 通道
  const wsChannel = createWebSocketChannel({ server, path: '/ws' });
  wsChannel.onMessage(handleMessage);
  wsChannel.onAbort((userId) => sessions.abort(userId));
  await wsChannel.start();
  channels.push(wsChannel);

  // 8. 启动 QQ Bot 通道（可选）
  if (config.qq.appId && config.qq.appSecret) {
    try {
      const qqChannel = createQQChannel({
        appId: config.qq.appId!,
        clientSecret: config.qq.clientSecret!,
      });
      qqChannel.onMessage(handleMessage);
      await qqChannel.start();
      channels.push(qqChannel);
      logger.info('[app] qq bot started');
    } catch (err) {
      logger.error('[app] qq bot failed to start: %s', (err as Error).message);
    }
  }

  // 9. 监听端口
  server.listen(config.port, () => {
    logger.info('[app] server started port=%d', config.port);
    logger.info('[app] websocket ws://localhost:%d/ws', config.port);
  });

  // 10. 初始化心跳调度器，每15分钟检查一次用户健康数据
  const heartbeat = startHeartbeatScheduler({
    store,
    intervalMs: 15 * 60 * 1000,
    sendMessage: async (userId, message) => {
      // 将关怀消息存入消息历史
      await store.messages.appendMessage(userId, {
        role: 'assistant',
        content: message,
        timestamp: Date.now(),
      });
      logger.info('[heartbeat] message stored userId=%s', userId);
    },
  });

  // 11. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info('[app] received %s, shutting down...', signal);

    const timeout = setTimeout(() => {
      logger.warn('[app] shutdown timeout (%dms), forcing exit', config.shutdownTimeout);
      process.exit(1);
    }, config.shutdownTimeout);

    try {
      // 0. 停止心跳调度器
      heartbeat.stop();

      // 1. 停止所有通道
      for (const channel of channels) {
        await channel.stop();
      }

      // 2. 关闭 HTTP 服务器 (promisified)
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      // 3. 清理会话
      sessions.close();

      // 4. 关闭存储
      store.close();

      clearTimeout(timeout);
      logger.info('[app] shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('[app] shutdown error=%s', (err as Error).message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('[app] fatal error=%s', err.message);
  process.exit(1);
});
