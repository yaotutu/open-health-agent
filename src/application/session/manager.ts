// src/application/session/manager.ts

import type { Agent } from '@mariozechner/pi-agent-core';
import type { SessionStore, Message } from '../../infrastructure/storage/session-store.js';
import { logger } from '../../infrastructure/logger.js';
import type { Session, SessionManager } from './types.js';

export interface CreateSessionManagerOptions {
  createAgent: (messages: Message[]) => Agent;
  sessionStore: SessionStore;
}

export const createSessionManager = (options: CreateSessionManagerOptions): SessionManager => {
  const { createAgent, sessionStore } = options;
  const sessions = new Map<string, Session>();

  const getOrCreate = async (userId: string): Promise<Session> => {
    // Check cache first
    let session = sessions.get(userId);
    if (session) {
      session.lastActiveAt = new Date();
      logger.debug('[session] accessed userId=%s', userId);
      return session;
    }

    // Load messages synchronously before creating session
    let messages: Message[] = [];
    try {
      messages = await sessionStore.getMessages(userId);
      logger.info('[session] loaded %d messages userId=%s', messages.length, userId);
    } catch (err) {
      logger.error('[session] failed to load messages userId=%s error=%s', userId, (err as Error).message);
    }

    // Create session with loaded messages
    session = {
      userId,
      agent: createAgent(messages),
      createdAt: new Date(),
      lastActiveAt: new Date(),
      messageHistory: messages,
      loaded: true,
    };
    sessions.set(userId, session);
    logger.info('[session] created userId=%s total=%d', userId, sessions.size);

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

  const saveMessage = async (userId: string, message: Message): Promise<void> => {
    const session = sessions.get(userId);
    if (session) {
      session.messageHistory.push(message);
    }
    await sessionStore.appendMessage(userId, message);
  };

  return {
    getOrCreate,
    get,
    remove,
    list,
    saveMessage,
  };
};

// 向后兼容：支持旧的调用方式（不含 sessionStore）
export const createSimpleSessionManager = (createAgent: () => Agent): SessionManager => {
  return createSessionManager({
    createAgent: () => createAgent(),
    sessionStore: {
      getMessages: async () => [],
      appendMessage: async () => {},
      clear: async () => {},
      close: async () => {},
    },
  });
};
