import type { Agent } from '@mariozechner/pi-agent-core';
import { logger } from '../../infrastructure/logger.js';
import type { Session, SessionManager } from './types.js';

export const createSessionManager = (createAgent: () => Agent): SessionManager => {
  const sessions = new Map<string, Session>();

  const getOrCreate = (userId: string): Session => {
    let session = sessions.get(userId);

    if (!session) {
      session = {
        userId,
        agent: createAgent(),
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      sessions.set(userId, session);
      logger.info('[session] created userId=%s total=%d', userId, sessions.size);
    } else {
      logger.debug('[session] accessed userId=%s', userId);
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

  return {
    getOrCreate,
    get,
    remove,
    list,
  };
};
