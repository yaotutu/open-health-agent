import type { Agent } from '@mariozechner/pi-agent-core';

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
    return sessions.delete(sessionId);
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
