import { QQBotClient, type MessageEvent } from 'pure-qqbot';
import type { DeliverableChannel, MessageHandler, ChannelMessage, ChannelContext } from './types';
import { createLogger } from '../infrastructure/logger';
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
    });
  }

  async start(): Promise<void> {
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
          guildId: (event as any).guildId,
          channelId: (event as any).channelId,
          attachments: event.attachments,
        },
      };

      // 从附件中提取图片，下载并转为 base64
      if (event.attachments && event.attachments.length > 0) {
        const images: Array<{ data: string; mimeType: string }> = [];
        for (const attachment of event.attachments) {
          // 注意：QQ Bot API 使用 content_type（蛇形命名），不是 contentType
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

      const context: ChannelContext = {
        send: async (text: string) => {
          await this.client.reply(event, text);
        },
        // QQ 不支持流式，不定义 sendStream，handler 会通过 send() 发送完整响应
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
   * 优先使用缓存的 openid（消息入口已统一为 qq:{appId}，不再包含 openid）
   * 降级从 userId 中解析（兼容旧数据）
   * @param userId 用户ID（格式: "qq:xxx"）
   * @param text 消息内容
   * @returns 是否成功送达
   */
  async sendToUser(userId: string, text: string): Promise<boolean> {
    // 优先使用缓存的 openid，降级从 userId 中解析
    const openid = this.cachedOpenId || userId.replace(/^qq:/, '');
    if (!openid) return false;

    try {
      const result = await this.client.sendPrivateMessageProactive(openid, text);
      return result.success;
    } catch (err) {
      log.error('push failed userId=%s openid=%s error=%s', userId, openid, (err as Error).message);
      return false;
    }
  }
}

export const createQQChannel = (options: QQChannelOptions): QQChannel => {
  return new QQChannel(options);
};
