import type { Agent } from '@mariozechner/pi-agent-core';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import { createHealthAgent } from '../agent';
import { createSessionManager, generateConversationSummary } from '../session';
import { createMessageHandler } from '../channels';
import type { ChannelAdapter, ChannelMessage, ChannelContext, DeliverableChannel } from '../channels';
import type { Store, Message } from '../store';
import type { CronService } from '../cron/service';
import { config } from '../config';
import { logger } from '../infrastructure/logger';
import { assembleSystemPrompt } from '../prompts/assembler';

/**
 * 每用户独立运行单元
 * 封装了一个用户完整的运行时：Agent、Session、Channel
 * 各用户之间完全隔离，互不影响
 */
export class UserBot {
  readonly userId: string;

  private session: ReturnType<typeof createSessionManager> extends Promise<infer T> ? never : ReturnType<typeof createSessionManager>;
  private handleMessage: (message: ChannelMessage, context: ChannelContext) => Promise<void>;
  private channels: Map<string, ChannelAdapter> = new Map();
  /** 支持主动推送的渠道列表（用于心跳、Cron 等场景） */
  private deliverableChannels: DeliverableChannel[] = [];

  /**
   * @param userId 用户ID
   * @param store 共享存储实例（数据通过 userId 天然隔离）
   * @param cronService 定时任务服务（可选）
   */
  constructor(
    userId: string,
    private store: Store,
    private cronService?: CronService,
  ) {
    this.userId = userId;

    // 创建 Agent 工厂函数：为这个用户创建专属 Agent
    const createAgent = async (uid: string, messages: Message[]) =>
      createHealthAgent({
        store,
        userId: uid,
        messages,
        channel: 'qq',
        cronService,
      });

    // 创建独立的会话管理器
    this.session = createSessionManager({
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
          logger.info('[user-bot] summary generated userId=%s count=%d', uid, messages.length);
        } catch (err) {
          logger.error('[user-bot] summary failed userId=%s error=%s', uid, (err as Error).message);
        }
      },
    });

    // 创建消息处理器
    this.handleMessage = createMessageHandler({ sessions: this.session, store });
  }

  /**
   * 添加渠道并启动监听
   * 渠道的 onMessage 注册后，所有收到的消息都会经过 handleMessage 处理
   * @param channel 渠道适配器实例
   */
  async addChannel(channel: ChannelAdapter): Promise<void> {
    // 注册消息处理回调
    channel.onMessage(async (message, context) => {
      await this.handleMessage(message, context);
    });

    // 启动渠道
    await channel.start();

    this.channels.set(channel.name, channel);

    // 如果是可主动推送的渠道，记录下来
    if ('sendToUser' in channel) {
      this.deliverableChannels.push(channel as DeliverableChannel);
    }

    logger.info('[user-bot] channel added userId=%s channel=%s', this.userId, channel.name);
  }

  /**
   * 向该用户主动推送消息
   * 遍历所有支持主动推送的渠道，第一个成功即停止
   * @param text 消息内容
   */
  async sendToUser(text: string): Promise<boolean> {
    for (const channel of this.deliverableChannels) {
      try {
        const delivered = await channel.sendToUser(this.userId, text);
        if (delivered) {
          logger.info('[user-bot] delivered userId=%s channel=%s', this.userId, channel.name);
          return true;
        }
      } catch (err) {
        logger.error('[user-bot] send failed userId=%s channel=%s error=%s', this.userId, channel.name, (err as Error).message);
      }
    }
    return false;
  }

  /**
   * 停止所有渠道并清理会话
   */
  async stop(): Promise<void> {
    // 停止所有渠道
    for (const channel of this.channels.values()) {
      try {
        await channel.stop();
      } catch (err) {
        logger.error('[user-bot] stop channel failed userId=%s channel=%s error=%s', this.userId, channel.name, (err as Error).message);
      }
    }
    this.channels.clear();
    this.deliverableChannels = [];

    // 清理会话
    this.session.close();

    logger.info('[user-bot] stopped userId=%s', this.userId);
  }
}
