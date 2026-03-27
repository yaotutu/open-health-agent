// src/application/session/types.ts

import type { Agent } from '@mariozechner/pi-agent-core';
import type { Message } from '../../infrastructure/storage/session-store.js';

/**
 * 会话 - 与通道无关，按userId管理
 */
export interface Session {
  /** 用户ID（跨通道统一标识） */
  userId: string;
  /** Agent实例 */
  agent: Agent;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活跃时间 */
  lastActiveAt: Date;
  /** 消息历史（内存缓存） */
  messageHistory: Message[];
  /** 是否已从存储加载 */
  loaded: boolean;
}

/**
 * 会话管理器接口
 */
export interface SessionManager {
  /** 获取或创建会话 */
  getOrCreate(userId: string): Session;
  /** 获取会话 */
  get(userId: string): Session | undefined;
  /** 删除会话 */
  remove(userId: string): boolean;
  /** 获取所有会话 */
  list(): string[];
  /** 保存会话消息 */
  saveMessage(userId: string, message: Message): Promise<void>;
}
