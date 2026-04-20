import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { WeChatClient, MessageType } from 'pure-wechat-bot';
import type { WeixinMessage } from 'pure-wechat-bot';
import type { DeliverableChannel, MessageHandler, ChannelMessage, ChannelContext } from './types';
import { createLogger } from '../infrastructure/logger';
const log = createLogger('wechat');

/**
 * 微信渠道配置
 * 通过 QR 扫码登录后获得，存入 binding 记录用于持久化
 */
export interface WeChatChannelOptions {
  /** iLink Bot Token（QR 登录后获得） */
  botToken: string;
  /** iLink API 基础地址，默认 https://ilinkai.weixin.qq.com */
  baseUrl: string;
  /** Bot 账号 ID（QR 登录后获得） */
  accountId?: string;
  /** 消息同步游标（重启恢复用，防止重复/遗漏消息） */
  cursor?: string;
}

/**
 * 微信渠道适配器
 * 使用 pure-wechat-bot 库连接微信 iLink Bot 服务器
 * 架构：OHA ←HTTP 长轮询→ 微信 iLink Bot 服务器 ←→ 微信客户端
 *
 * wechat-ilink 提供 CDN 加密上传、发送图片、打字指示器等能力。
 */
export class WeChatChannel implements DeliverableChannel {
  readonly name = 'wechat';
  private client: WeChatClient;
  private messageHandler?: MessageHandler;
  /** 从入站消息中缓存的微信用户 ID（如 o9cq800kum_xxx@im.wechat），用于主动推送 */
  private cachedWechatUserId: string | null = null;
  /** 缓存的同步游标，通过 saveSyncBuf 回调更新，供 getCursor() 外部持久化 */
  private syncCursor: string = '';

  constructor(options: WeChatChannelOptions) {
    this.client = new WeChatClient({
      token: options.botToken,
      baseUrl: options.baseUrl,
      accountId: options.accountId,
    });
    // 恢复上次的同步游标，避免重启后重复处理消息
    if (options.cursor) {
      this.syncCursor = options.cursor;
      log.info('cursor restored cursor=%s...', options.cursor.slice(0, 20));
    }
    log.info('channel created baseUrl=%s accountId=%s', options.baseUrl, options.accountId || '(none)');
  }

  async start(): Promise<void> {
    // 注册消息事件处理器
    this.client.on('message', async (msg: WeixinMessage) => {
      // 只处理用户消息（message_type=1），忽略 BOT 类型（自己发出的）
      if (msg.message_type === MessageType.USER) {
        await this.processMessage(msg);
      }
    });

    this.client.on('error', (err: Error) => {
      log.error('client error: %s', err.message);
    });

    this.client.on('sessionExpired', () => {
      log.warn('session expired, bot will pause automatically');
    });

    // 启动长轮询循环（fire-and-forget：client.start() 阻塞直到 stop()，不能 await）
    this.client.start({
      loadSyncBuf: () => this.syncCursor || undefined,
      saveSyncBuf: (buf: string) => {
        this.syncCursor = buf;
        log.debug('sync cursor updated len=%d', buf.length);
      },
    }).catch((err: Error) => {
      log.error('poll loop crashed: %s', err.message);
    });
    log.info('channel started polling');
  }

  async stop(): Promise<void> {
    this.client.stop();
    log.info('channel stopped cursor=%s', this.syncCursor.slice(0, 20));
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * 主动向用户发送消息（用于心跳、定时任务等推送场景）
   * 使用缓存的微信用户 ID 和 contextToken
   * @param userId 用户ID（格式: "wechat:xxx"）
   * @param text 消息内容
   * @returns 是否成功送达
   */
  async sendToUser(userId: string, text: string): Promise<boolean> {
    if (!this.cachedWechatUserId) {
      log.warn('push skipped: no cached wechat userId');
      return false;
    }

    try {
      log.info('pushing to userId=%s wechatUserId=%s textLen=%d', userId, this.cachedWechatUserId, text.length);
      await this.client.sendText(this.cachedWechatUserId, text);
      log.info('push sent userId=%s', userId);
      return true;
    } catch (err) {
      log.error('push failed userId=%s error=%s', userId, (err as Error).message);
      return false;
    }
  }

  /**
   * 获取当前同步游标，供外部持久化（BotManager 在 stop 时调用）
   */
  getCursor(): string {
    return this.syncCursor;
  }

  /**
   * 处理单条入站消息
   * 1. 缓存用户 ID 和 contextToken（用于主动推送）
   * 2. 从 item_list 提取文本和图片
   * 3. 构造统一的 ChannelMessage
   * 4. 通过 messageHandler 传递给 UserBot 处理
   */
  private async processMessage(msg: WeixinMessage): Promise<void> {
    if (!this.messageHandler) return;

    // 缓存用户标识，用于后续主动推送
    const fromUserId = msg.from_user_id || '';
    if (fromUserId) {
      this.cachedWechatUserId = fromUserId;
    }

    log.info('processing message msgId=%s from=%s type=%d items=%d',
      msg.message_id || msg.seq,
      fromUserId.slice(0, 20),
      msg.message_type,
      msg.item_list?.length || 0,
    );

    // 使用 pure-wechat-bot 提供的 extractText 提取文本
    const text = WeChatClient.extractText(msg);

    // 下载图片并转为 base64
    const images: Array<{ data: string; mimeType: string }> = [];
    if (msg.item_list) {
      for (const item of msg.item_list) {
        if (WeChatClient.isMediaItem(item) && item.image_item) {
          try {
            const downloaded = await this.client.downloadMedia(item);
            if (downloaded) {
              const base64 = downloaded.data.toString('base64');
              images.push({ data: base64, mimeType: 'image/jpeg' });
              log.info('image downloaded size=%d bytes', downloaded.data.length);
            }
          } catch (err) {
            log.error('image download failed error=%s', (err as Error).message);
          }
        }
      }
    }

    // 构造统一的 ChannelMessage
    const channelMsg: ChannelMessage = {
      id: String(msg.message_id || msg.seq || Date.now()),
      userId: `wechat:${fromUserId}`,
      content: text,
      channel: 'wechat',
      timestamp: new Date(msg.create_time_ms || Date.now()),
      metadata: {
        contextToken: msg.context_token,
        fromUserId,
        sessionId: msg.session_id,
      },
    };

    if (images.length > 0) {
      channelMsg.images = images;
    }

    log.info('dispatching message msgId=%s textLen=%d images=%d', channelMsg.id, text.length, images.length);

    // 构造 ChannelContext，微信不支持流式，实现 send() + sendImage() + sendTyping()
    const context: ChannelContext = {
      send: async (text: string) => {
        log.info('sending reply to=%s textLen=%d', fromUserId.slice(0, 20), text.length);
        await this.client.sendText(fromUserId, text, msg.context_token || undefined);
        log.info('reply sent msgId=%s', channelMsg.id);
      },
      // 发送图片：写入临时文件 → sendMedia 自动上传加密并发送
      sendImage: async (base64Data: string, _mimeType: string) => {
        const tempPath = join(tmpdir(), `oha-chart-${Date.now()}.png`);
        try {
          const rawBuffer = Buffer.from(base64Data, 'base64');
          writeFileSync(tempPath, rawBuffer);
          log.info('sendImage: wrote temp file path=%s size=%d', tempPath, rawBuffer.length);

          // sendMedia 会自动完成 AES 加密、CDN 上传、构造正确的 sendMessage 请求
          await this.client.sendMedia(fromUserId, tempPath, undefined, msg.context_token || undefined);
          log.info('image sent raw=%d', rawBuffer.length);
        } catch (err) {
          log.error('sendImage failed error=%s', (err as Error).message);
        } finally {
          // 清理临时文件
          if (existsSync(tempPath)) {
            try { unlinkSync(tempPath); } catch { /* ignore cleanup errors */ }
          }
        }
      },
      sendTyping: async () => {
        try {
          // 先获取 typing ticket，再发送打字指示器
          const ticket = await this.client.getTypingTicket(fromUserId, msg.context_token || undefined);
          await this.client.sendTyping(fromUserId, ticket, 'typing');
        } catch (err) {
          log.error('sendTyping failed error=%s', (err as Error).message);
        }
      },
    };

    await this.messageHandler(channelMsg, context);
  }
}

export const createWeChatChannel = (options: WeChatChannelOptions): WeChatChannel => {
  return new WeChatChannel(options);
};
