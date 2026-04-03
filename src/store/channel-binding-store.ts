import { eq, and } from 'drizzle-orm';
import type { Db } from './db';
import { channelBindings } from './schema';
import type { ChannelBinding, NewChannelBinding } from './schema';
import { createLogger } from '../infrastructure/logger';
const log = createLogger('store');

/**
 * 渠道绑定存储层
 * 提供用户渠道绑定的 CRUD 操作
 * 每个绑定记录包含用户ID、渠道类型、凭据和状态
 */
export class ChannelBindingStore {
  constructor(private db: Db) {}

  /**
   * 创建新的渠道绑定
   * @param binding 绑定信息（不含 id 和时间戳）
   * @returns 创建后的完整绑定记录
   */
  async create(binding: Omit<NewChannelBinding, 'id' | 'createdAt' | 'updatedAt'>): Promise<ChannelBinding> {
    const now = Date.now();
    const result = await this.db.insert(channelBindings).values({
      ...binding,
      createdAt: now,
      updatedAt: now,
    }).returning();

    log.info('binding created userId=%s channel=%s', binding.userId, binding.channelType);
    return result[0];
  }

  /**
   * 根据 userId 查询活跃的渠道绑定
   * @param userId 用户ID
   * @returns 活跃的绑定记录，不存在则返回 undefined
   */
  async getActiveByUserId(userId: string): Promise<ChannelBinding | undefined> {
    const results = await this.db.select()
      .from(channelBindings)
      .where(and(
        eq(channelBindings.userId, userId),
        eq(channelBindings.status, 'active'),
      ))
      .limit(1);

    return results[0];
  }

  /**
   * 查询所有活跃的渠道绑定
   * 用于服务启动时恢复所有用户的 Bot 实例
   * @returns 所有活跃绑定列表
   */
  async listActive(): Promise<ChannelBinding[]> {
    return this.db.select()
      .from(channelBindings)
      .where(eq(channelBindings.status, 'active'));
  }

  /**
   * 更新绑定状态（停用或重新激活）
   * @param userId 用户ID
   * @param status 目标状态
   */
  async updateStatus(userId: string, status: 'active' | 'inactive'): Promise<void> {
    await this.db.update(channelBindings)
      .set({ status, updatedAt: Date.now() })
      .where(eq(channelBindings.userId, userId));

    log.info('binding status updated userId=%s status=%s', userId, status);
  }

  /**
   * 更新绑定凭据（用于保存微信消息同步游标等需要更新的凭据字段）
   * @param userId 用户ID
   * @param credentials 新的凭据 JSON 字符串
   */
  async updateCredentials(userId: string, credentials: string): Promise<void> {
    await this.db.update(channelBindings)
      .set({ credentials, updatedAt: Date.now() })
      .where(eq(channelBindings.userId, userId));
  }

  /**
   * 删除绑定记录
   * @param userId 用户ID
   */
  async delete(userId: string): Promise<void> {
    await this.db.delete(channelBindings)
      .where(eq(channelBindings.userId, userId));

    log.info('binding deleted userId=%s', userId);
  }
}
