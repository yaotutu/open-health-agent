import { eq, asc, desc } from 'drizzle-orm';
import type { Db } from './db';
import { messages, type Message, type NewMessage } from './schema';

/** 默认加载最近的消息条数，避免上下文过长超出 LLM token 限制 */
const DEFAULT_MESSAGE_LIMIT = 100;

export const createMessageStore = (db: Db) => {
  /**
   * 获取用户的消息历史
   * 先按时间倒序取最近 limit 条，再正序排列，确保上下文顺序正确
   * @param userId 用户ID
   * @param limit 最大返回条数，默认 100
   */
  const getMessages = async (userId: string, limit: number = DEFAULT_MESSAGE_LIMIT): Promise<Message[]> => {
    // 先倒序取最近的 N 条（避免全量加载后再截断）
    const recent = await db.select()
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
    // 再反转为时间正序（对话上下文需要按时间顺序排列）
    return recent.reverse();
  };

  const appendMessage = async (userId: string, data: Omit<NewMessage, 'id' | 'userId'>): Promise<Message> => {
    const result = await db.insert(messages)
      .values({ ...data, userId })
      .returning();
    return result[0];
  };

  const clear = async (userId: string): Promise<void> => {
    await db.delete(messages).where(eq(messages.userId, userId));
  };

  /**
   * 获取用户最后一条消息的时间戳
   * 用于惰性摘要触发：判断用户是否长时间未活跃
   * @param userId 用户ID
   * @returns 最后一条消息的时间戳，无消息返回 null
   */
  const getLastMessageTimestamp = async (userId: string): Promise<number | null> => {
    const result = await db.select({ timestamp: messages.timestamp })
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.timestamp))
      .limit(1);
    return result[0]?.timestamp ?? null;
  };

  return { getMessages, appendMessage, clear, getLastMessageTimestamp };
};

export type MessageStore = ReturnType<typeof createMessageStore>;
