import { QQBotClient, ApiError, type MessageEvent, type StreamMessageRequest } from 'pure-qqbot';
import type { DeliverableChannel, MessageHandler, ChannelMessage, ChannelContext } from './types';
import { createLogger } from '../infrastructure/logger';
import { config } from '../config';
import { mkdir } from 'node:fs/promises';
const log = createLogger('qq');

export interface QQChannelOptions {
  appId: string;
  clientSecret: string;
}

export class QQChannel implements DeliverableChannel {
  readonly name = 'qq';
  private client: QQBotClient;
  private messageHandler?: MessageHandler;
  /** 缓存用户的 openid，用于主动推送（sendToUser） */
  private cachedOpenId: string | null = null;

  constructor(options: QQChannelOptions) {
    this.client = new QQBotClient({
      appId: options.appId,
      clientSecret: options.clientSecret,
      // 会话持久化：跨重启恢复 WebSocket 连接
      sessionDir: config.qq.sessionDir,
      // 处理消息期间自动重发"正在输入"提示
      typingKeepAlive: config.qq.typingKeepAlive,
      // 解析 QQ 表情标签为可读文本
      parseFaceEmoji: config.qq.parseFaceEmoji,
      // 重连策略：逐步增加延迟，最多重试 10 次
      reconnectDelays: [1000, 3000, 5000, 10000, 30000],
      maxReconnectAttempts: 10,
      // 自定义 logger：过滤心跳噪音，其余走 pino
      logger: {
        info: (msg: string) => {
          if (msg.includes('Heartbeat')) return;
          log.info('gateway %s', msg);
        },
        error: (msg: string) => log.error('gateway %s', msg),
        debug: (msg: string) => {
          if (msg.includes('Heartbeat')) return;
          log.debug('gateway %s', msg);
        },
      },
    });
  }

  async start(): Promise<void> {
    // 确保会话持久化目录存在
    await mkdir(config.qq.sessionDir, { recursive: true });

    this.client.onMessage(async (event: MessageEvent) => {
      if (!this.messageHandler) return;

      // 缓存 openid，用于后续主动推送
      // 同一个 QQ Bot 应用只服务一个用户，openid 不会变
      this.cachedOpenId = event.senderId;

      const channelMsg: ChannelMessage = {
        id: event.messageId,
        userId: `qq:${event.senderId}`,
        content: event.content || '',
        channel: 'qq',
        timestamp: new Date(),
        metadata: {
          type: event.type,
          guildId: event.guildId,
          channelId: event.channelId,
          groupOpenid: event.groupOpenid,
          attachments: event.attachments,
        },
      };

      // 从附件中提取图片，下载并转为 base64
      if (event.attachments && event.attachments.length > 0) {
        const images: Array<{ data: string; mimeType: string }> = [];
        for (const attachment of event.attachments) {
          // QQ Bot API 使用 content_type（蛇形命名）
          if (attachment.content_type?.startsWith('image/') && attachment.url) {
            try {
              const response = await fetch(attachment.url);
              const buffer = await response.arrayBuffer();
              const base64 = Buffer.from(buffer).toString('base64');
              images.push({ data: base64, mimeType: attachment.content_type });
            } catch (err) {
              log.error('image download failed url=%s error=%s', attachment.url, (err as Error).message);
            }
          }
        }
        if (images.length > 0) {
          channelMsg.images = images;
        }
      }

      // 流式消息状态：累积文本、streamMsgId、序号、分片索引
      // 用定时器合并高频 text_delta，避免打爆 QQ API 频率限制
      // 参考 pure-qqbot example：每 300ms 发一次，每次传累积全文（replace 模式）
      const STREAM_INTERVAL_MS = 300;
      let streamBuffer = '';
      let streamMsgId: string | undefined;
      let streamSeq = 1;
      let streamIndex = 0;
      let streamTimer: ReturnType<typeof setTimeout> | null = null;
      let streamFailed = false;

      /** 实际调用 QQ 流式 API */
      const flushStream = async (done: boolean) => {
        if (!streamBuffer && !done) return;
        try {
          const request: StreamMessageRequest = {
            event_id: event.messageId,
            input_mode: 'replace',
            input_state: done ? 10 : 1,
            content_type: 'markdown',
            content_raw: streamBuffer,
            msg_id: event.messageId,
            stream_msg_id: streamMsgId,
            msg_seq: streamSeq++,
            index: streamIndex++,
          };
          const result = await this.client.sendStreamMessage(event.senderId, request);
          if (!result.success) {
            log.error('stream flush failed seq=%d error=%s', streamSeq - 1, result.error);
            streamFailed = true;
            return;
          }
          if (result.streamMsgId) {
            streamMsgId = result.streamMsgId;
          }
        } catch (err) {
          log.error('stream flush error seq=%d error=%s', streamSeq - 1, (err as Error).message);
          streamFailed = true;
        }
      };

      const context: ChannelContext = {
        // 发送图片（base64 → data URL → QQ 富媒体上传）
        sendImage: async (base64Data: string, mimeType: string) => {
          try {
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            await this.client.sendPrivateImage(event.senderId, dataUrl);
          } catch (err) {
            log.error('sendImage failed error=%s', (err as Error).message);
          }
        },

        // 完整文本回复（流式失败时的降级兜底）
        send: async (text: string) => {
          await this.client.reply(event, text);
        },

        // 流式发送文本增量（打字机效果）
        // 累积增量到 buffer，每 300ms 刷新一次到 QQ API，避免高频触发限流
        sendStream: async (text: string, done: boolean) => {
          streamBuffer += text;

          if (streamFailed) {
            // 流式已失败，不再调 API，等 done 时降级为完整回复
            if (done) {
              await this.client.reply(event, streamBuffer).catch((err: Error) => {
                log.error('stream fallback reply failed error=%s', err.message);
              });
            }
            return;
          }

          if (done) {
            // 最后一块：立即刷新，清理定时器
            if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
            await flushStream(true);
          } else if (!streamTimer) {
            // 首个增量：启动定时刷新
            streamTimer = setTimeout(async () => {
              streamTimer = null;
              if (!streamFailed) await flushStream(false);
            }, STREAM_INTERVAL_MS);
          }
          // 中间增量：只累积到 buffer，等定时器触发统一发送
        },

        // 发送"正在输入"提示
        sendTyping: async () => {
          try {
            await this.client.sendTypingIndicator(event.senderId, event.messageId);
          } catch (err) {
            log.error('sendTyping failed error=%s', (err as Error).message);
          }
        },

        capabilities: { streaming: true },
      };

      await this.messageHandler(channelMsg, context);
    });

    await this.client.start();
    log.info('channel started');
  }

  async stop(): Promise<void> {
    await this.client.stop();
    log.info('channel stopped');
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * 主动向用户发送消息（无需用户先发消息）
   * 用于 heartbeat、cron 等定时推送场景
   */
  async sendToUser(userId: string, text: string): Promise<boolean> {
    // 优先使用缓存的 openid，降级从 userId 中解析
    const openid = this.cachedOpenId || userId.replace(/^qq:/, '');
    if (!openid) return false;

    try {
      const result = await this.client.sendPrivateMessageProactive(openid, text);
      return result.success;
    } catch (err) {
      // pure-qqbot 2.0: API 错误抛出 ApiError，包含详细错误信息
      if (err instanceof ApiError) {
        log.error('push failed userId=%s openid=%s status=%d bizCode=%s bizMessage=%s',
          userId, openid, err.status, err.bizCode, err.bizMessage);
      } else {
        log.error('push failed userId=%s openid=%s error=%s', userId, openid, (err as Error).message);
      }
      return false;
    }
  }
}

export const createQQChannel = (options: QQChannelOptions): QQChannel => {
  return new QQChannel(options);
};
