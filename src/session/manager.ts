import type { Agent } from '@mariozechner/pi-agent-core';
import type { Store, Message } from '../store';
import { logger } from '../infrastructure/logger';

export interface Session {
  userId: string;
  agent: Agent;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SessionManager {
  getOrCreate(userId: string): Session;
  get(userId: string): Session | undefined;
  remove(userId: string): boolean;
  list(): string[];
}

export interface CreateSessionManagerOptions {
  createAgent: (messages: Message[]) => Agent;
  store: Store;
}

export const createSessionManager = (options: CreateSessionManagerOptions): SessionManager => {
  const { createAgent, store } = options;
  const sessions = new Map<string, Session>();

  const getOrCreate = (userId: string): Session => {
    let session = sessions.get(userId);

    if (!session) {
      session = {
        userId,
        agent: createAgent([]),
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      sessions.set(userId, session);
      logger.info('[session] created userId=%s total=%d', userId, sessions.size);

      // 异步加载历史消息
      store.messages.getMessages(userId).then(messages => {
        if (messages.length > 0) {
          session!.agent = createAgent(messages);
          logger.info('[session] loaded %d messages userId=%s', messages.length, userId);
        }
      });
    }

    session.lastActiveAt = new Date();
    return session;
  };

  const get = (userId: string): Session | undefined => {
    return sessions.get(userId);
  };

  const remove = (userId: string): boolean => {
    const result = sessions.delete(userId);
    if (result) {
      logger.info('[session] removed userId=%s total=%d', userId, sessions.size);
    }
    return result;
  };

  const list = (): string[] => {
    return Array.from(sessions.keys());
  };

  return { getOrCreate, get, remove, list };
};
