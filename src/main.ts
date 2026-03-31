import 'dotenv/config';
import http from 'http';
import { config } from './config';
import { Store } from './store';
import { createWebSocketChannel } from './channels';
import { BotManager } from './bot';
import { createApp } from './server';
import { CronService } from './cron/service';
import { startHeartbeatScheduler } from './heartbeat';
import { logger, dbLogWriter } from './infrastructure/logger';

/**
 * 将 Node.js http 请求桥接到 Hono 处理
 * 将 Node 的 IncomingMessage 转换为标准 Request 对象，交给 Hono 处理
 * 这样可以在同一个 http 服务器上同时支持 Hono 路由和 ws 库的 WebSocket
 */
function bridgeToHono(honoFetch: (req: Request) => Response | Promise<Response>) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      // 构造完整 URL
      const protocol = 'http';
      const host = req.headers.host || `localhost:${config.port}`;
      const url = new URL(req.url!, `${protocol}://${host}`);

      // 收集请求体
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) {
        chunks.push(new Uint8Array(chunk as ArrayBuffer));
      }
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      // 构造标准 Request 对象
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      }

      const webRequest = new Request(url.toString(), {
        method: req.method || 'GET',
        headers,
        body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body,
      });

      // 交给 Hono 处理
      const webResponse = await honoFetch(webRequest);

      // 将 Hono 响应写回 Node 响应
      res.statusCode = webResponse.status;
      webResponse.headers.forEach((v, k) => {
        res.setHeader(k, v);
      });

      if (webResponse.body) {
        const reader = webResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      logger.error('[app] request bridge error=%s', (err as Error).message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  };
}

async function main() {
  logger.info('[app] starting health advisor agent...');
  if (config.testMode) logger.info('[app] TEST_MODE enabled: no history, no summaries');

  // 1. 初始化存储
  const store = new Store(config.dbPath);
  dbLogWriter.init(store.logs);
  logger.info('[app] database initialized path=%s', config.dbPath);

  // 2. Bot 管理器（管理所有用户的独立 Bot 实例）
  const botManager = new BotManager(store);

  // 3. 定时任务服务
  const cronService = new CronService({
    storePath: config.cron.storePath,
    onJob: async (job) => {
      const userId = job.payload.to;
      if (!userId) return;

      logger.info('[cron] executing id=%s name=%s userId=%s', job.id, job.name, userId);
      cronService.setCronContext(true);
      try {
        // 通过 BotManager 获取用户的 Bot 实例来执行任务
        const bot = botManager.getBot(userId);
        if (!bot) {
          logger.warn('[cron] no bot for userId=%s', userId);
          return;
        }

        // 为 cron 任务创建临时 Agent
        const { createHealthAgent } = await import('./agent');
        const agent = await createHealthAgent({ store, userId, cronService });

        const events: any[] = [];
        agent.subscribe((event: any) => events.push(event));
        await agent.prompt(job.payload.message);

        if (job.payload.deliver) {
          let responseText = '';
          for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].type === 'done' && events[i].message) {
              responseText = events[i].message.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('');
              break;
            }
          }
          if (responseText) {
            await store.messages.appendMessage(userId, {
              role: 'assistant',
              content: responseText,
              timestamp: Date.now(),
            });
            await bot.sendToUser(responseText);
          }
        }
      } catch (err) {
        logger.error('[cron] execute failed id=%s error=%s', job.id, (err as Error).message);
      } finally {
        cronService.setCronContext(false);
      }
    },
  });
  await cronService.start();

  // 4. 创建 Hono 应用（API 路由 + 前端静态文件）
  const honoApp = createApp(botManager);

  // 5. 创建 HTTP 服务器，桥接 Hono
  const server = http.createServer(bridgeToHono(honoApp.fetch));

  // 6. WebSocket 通道（保留作为开发/调试用途）
  const wsChannel = createWebSocketChannel({ server, path: '/ws' });
  wsChannel.onMessage(async (message, context) => {
    // WebSocket 消息通过 BotManager 查找对应用户的 Bot 来处理
    // 如果没有对应的 Bot，则直接用消息处理器处理
    const { createMessageHandler } = await import('./channels');
    const { createSessionManager, generateConversationSummary } = await import('./session');
    const { createHealthAgent } = await import('./agent');

    const createAgent = async (uid: string, msgs: Parameters<typeof createHealthAgent>[0]['messages']) =>
      createHealthAgent({ store, userId: uid, messages: msgs, cronService });

    const sessions = createSessionManager({
      createAgent,
      store,
      noHistory: config.testMode,
      onSessionExpired: config.testMode ? undefined : async (uid: string) => {
        try {
          const messages = await store.messages.getMessages(uid);
          if (messages.length < 4) return;
          const summary = await generateConversationSummary(messages);
          await store.summary.save(uid, {
            summary,
            messageCount: messages.length,
            startTimestamp: messages[0].timestamp,
            endTimestamp: messages[messages.length - 1].timestamp,
          });
        } catch (err) {
          logger.error('[ws] summary failed userId=%s error=%s', uid, (err as Error).message);
        }
      },
    });

    const handler = createMessageHandler({ sessions, store });
    await handler(message, context);
  });

  await wsChannel.start();

  // 7. 从数据库恢复已绑定用户的 Bot 实例
  await botManager.init();

  // 8. 监听端口
  server.listen(config.port, () => {
    logger.info('[app] server started port=%d', config.port);
    logger.info('[app] websocket ws://localhost:%d/ws', config.port);
    logger.info('[app] login page http://localhost:%d', config.port);
  });

  // 9. 启动心跳调度器
  const heartbeat = startHeartbeatScheduler({
    store,
    intervalMs: config.heartbeat.intervalMs,
    sendToUser: async (userId, message) => {
      await store.messages.appendMessage(userId, {
        role: 'assistant',
        content: message,
        timestamp: Date.now(),
      });
      // 通过 BotManager 找到用户的 Bot 来推送
      const bot = botManager.getBot(userId);
      if (bot) {
        await bot.sendToUser(message);
      }
    },
  });

  // 10. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info('[app] received %s, shutting down...', signal);

    const timeout = setTimeout(() => {
      logger.warn('[app] shutdown timeout (%dms), forcing exit', config.shutdownTimeout);
      process.exit(1);
    }, config.shutdownTimeout);

    try {
      cronService.stop();
      heartbeat.stop();
      await botManager.stopAll();
      await wsChannel.stop();

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

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
