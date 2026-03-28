import { QQBotClient, type MessageEvent } from 'pure-qqbot';
import type { ChannelAdapter, MessageHandler, ChannelMessage, ChannelContext } from './types';
import { logger } from '../infrastructure/logger';

export interface QQChannelOptions {
  appId: string;
  clientSecret: string;
}

export class QQChannel implements ChannelAdapter {
  readonly name = 'qq';
  private client: QQBotClient;
  private messageHandler?: MessageHandler;

  constructor(options: QQChannelOptions) {
    this.client = new QQBotClient({
      appId: options.appId,
      clientSecret: options.clientSecret,
    });
  }

  async start(): Promise<void> {
    this.client.onMessage(async (event: MessageEvent) => {
      if (!this.messageHandler) return;

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
              logger.error('[qq] 图片下载失败 url=%s error=%s', attachment.url, (err as Error).message);
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
    logger.info('[qq] channel started');
  }

  async stop(): Promise<void> {
    await this.client.stop();
    logger.info('[qq] channel stopped');
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}

export const createQQChannel = (options: QQChannelOptions): QQChannel => {
  return new QQChannel(options);
};
