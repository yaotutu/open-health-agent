import type { Agent } from '@mariozechner/pi-agent-core';
import { logger } from '../logger/index.js';

export interface Session {
  id: string;
  agent: Agent;
  createdAt: Date;
  lastActiveAt: Date;
}

// 创建会话管理器
export const createSessionManager = (createAgent: () => Agent) => {
  const sessions = new Map<string, Session>();

  // 获取或创建会话
  const getOrCreate = (sessionId: string): Session => {
    let session = sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        agent: createAgent(),
        createdAt: new Date(),
        lastActiveAt: new Date(),
      };
      sessions.set(sessionId, session);
      logger.info('[session] created id=%s total=%d', sessionId, sessions.size);
    } else {
      logger.debug('[session] accessed id=%s', sessionId);
    }

    session.lastActiveAt = new Date();
    return session;
  };

  // 获取会话
  const get = (sessionId: string): Session | undefined => {
    return sessions.get(sessionId);
  };

  // 删除会话
  const remove = (sessionId: string): boolean => {
    const result = sessions.delete(sessionId);
    if (result) {
      logger.info('[session] removed id=%s total=%d', sessionId, sessions.size);
    }
    return result;
  };

  // 获取所有会话 ID
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

export type SessionManager = ReturnType<typeof createSessionManager>;
