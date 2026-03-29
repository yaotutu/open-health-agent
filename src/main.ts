import 'dotenv/config';
import http from 'http';
import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { Context } from '@mariozechner/pi-ai';
import { Store } from './store';
import type { Message } from './store';
import { createHealthAgent } from './agent';
import { createSessionManager } from './session';
import { createMessageHandler, createWebSocketChannel, createQQChannel } from './channels';
import type { ChannelAdapter } from './channels';
import { startHeartbeatScheduler } from './heartbeat';
import { logger, dbLogWriter } from './infrastructure/logger';

const PORT = parseInt(process.env.PORT || '3001', 10);
const DB_PATH = process.env.DB_PATH || './data/healthclaw.db';
const SHUTDOWN_TIMEOUT = 10000;
/** 测试模式：不加载历史消息，不生成对话摘要 */
const TEST_MODE = process.env.TEST_MODE === '1';

/**
 * 使用 LLM 生成对话摘要
 * 提取最近对话的关键内容，压缩为一段简短的摘要
 * @param messages 用户的对话消息列表
 * @returns 生成的对话摘要文本
 */
async function generateConversationSummary(messages: Message[]): Promise<string> {
  // 取最近20条消息，避免过长输入
  const recent = messages.slice(-20);

  // 构造对话内容文本，将消息列表拼接为可读的对话记录
  const conversationText = recent
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');

  // 获取 LLM 模型实例
  const model = getModel(
    (process.env.LLM_PROVIDER || 'anthropic') as any,
    (process.env.LLM_MODEL || 'claude-sonnet-4-6') as any
  );

  // 构建 LLM 请求上下文，包含系统提示和对话内容
  const context: Context = {
    systemPrompt: '你是一个对话摘要生成器。请用中文将以下健康顾问对话压缩为2-3句话的摘要，保留关键的健康信息、用户提到的问题和建议。只输出摘要内容，不要其他文字。',
    messages: [{
      role: 'user',
      content: conversationText,
      timestamp: Date.now(),
    }],
  };

  // 使用 streamSimple 获取 LLM 响应，提取最终生成的摘要文本
  const stream = streamSimple(model, context);
  let summary = '';
  for await (const event of stream) {
    if (event.type === 'done' && event.message) {
      summary = event.message.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');
    }
  }
  return summary || '对话摘要生成失败';
}

async function main() {
  logger.info('[app] starting health advisor agent...');
  if (TEST_MODE) logger.info('[app] TEST_MODE enabled: no history, no summaries');

  // 1. 初始化存储
  const store = new Store(DB_PATH);
  // 将日志存储注入 logger，之后所有日志将写入数据库
  dbLogWriter.init(store.logs);
  logger.info('[app] database initialized path=%s', DB_PATH);

  // 2. 创建 Agent 工厂（异步函数，因为需要查询用户档案）
  const createAgent = async (userId: string, messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
    createHealthAgent({ store, userId, messages });

  // 3. 会话管理（包含过期时的对话摘要生成回调）
  const sessions = createSessionManager({
    createAgent,
    store,
    noHistory: TEST_MODE,
    /** 会话过期时自动生成对话摘要并保存到数据库（测试模式下跳过） */
    onSessionExpired: TEST_MODE ? undefined : async (userId: string) => {
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
  if (process.env.QQBOT_APP_ID && process.env.QQBOT_APP_SECRET) {
    try {
      const qqChannel = createQQChannel({
        appId: process.env.QQBOT_APP_ID,
        clientSecret: process.env.QQBOT_CLIENT_SECRET || process.env.QQBOT_APP_SECRET,
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
  server.listen(PORT, () => {
    logger.info('[app] server started port=%d', PORT);
    logger.info('[app] websocket ws://localhost:%d/ws', PORT);
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
      logger.warn('[app] shutdown timeout (%dms), forcing exit', SHUTDOWN_TIMEOUT);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

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
