/**
 * 心跳任务的存储层
 * 每个用户只有一条心跳记录，content 字段存储所有任务（换行分隔）
 */
import type { Database } from 'bun:sqlite';

/** 心跳任务记录（每个用户唯一一条） */
export interface HeartbeatRecord {
  userId: string;
  /** 所有任务内容，换行分隔 */
  content: string;
  enabled: boolean;
  updatedAt: number;
}

/**
 * 创建心跳任务存储实例
 * @param sqlite SQLite 数据库实例
 * @returns 心跳任务存储对象
 */
export const createHeartbeatTaskStore = (sqlite: Database) => {
  return {
    /**
     * 获取用户的心跳任务列表（仅启用的）
     * @param userId 用户ID
     * @returns 任务内容数组，无任务返回空数组
     */
    getEnabledTasks(userId: string): string[] {
      const row = sqlite.query(
        'SELECT content FROM heartbeat_tasks WHERE user_id = ? AND enabled = 1'
      ).get(userId) as { content: string } | null;
      if (!row || !row.content.trim()) return [];
      return row.content.split('\n').map(l => l.trim()).filter(Boolean);
    },

    /**
     * 获取用户的心跳记录
     * @param userId 用户ID
     * @returns 心跳记录或 null
     */
    get(userId: string): HeartbeatRecord | null {
      return sqlite.query(
        'SELECT user_id as userId, content, enabled, updated_at as updatedAt FROM heartbeat_tasks WHERE user_id = ?'
      ).get(userId) as HeartbeatRecord | null;
    },

    /**
     * 添加一条任务到用户的心跳中
     * 如果用户还没有心跳记录，自动创建
     * @param userId 用户ID
     * @param task 任务内容
     */
    addTask(userId: string, task: string): void {
      const existing = sqlite.query(
        'SELECT content FROM heartbeat_tasks WHERE user_id = ?'
      ).get(userId) as { content: string } | null;

      if (existing) {
        // 追加任务
        const newContent = existing.content ? `${existing.content}\n${task}` : task;
        sqlite.query(
          'UPDATE heartbeat_tasks SET content = ?, updated_at = ? WHERE user_id = ?'
        ).run(newContent, Date.now(), userId);
      } else {
        // 首次创建
        sqlite.query(
          'INSERT INTO heartbeat_tasks (user_id, content, enabled, created_at, updated_at) VALUES (?, ?, 1, ?, ?)'
        ).run(userId, task, Date.now(), Date.now());
      }
    },

    /**
     * 删除用户心跳中的指定任务（按行号索引）
     * @param userId 用户ID
     * @param lineIndex 行号索引（从 1 开始）
     * @returns 是否删除成功
     */
    removeTask(userId: string, lineIndex: number): boolean {
      const row = sqlite.query(
        'SELECT content FROM heartbeat_tasks WHERE user_id = ?'
      ).get(userId) as { content: string } | null;
      if (!row) return false;

      const lines = row.content.split('\n').map(l => l.trim()).filter(Boolean);
      if (lineIndex < 1 || lineIndex > lines.length) return false;

      lines.splice(lineIndex - 1, 1);
      sqlite.query(
        'UPDATE heartbeat_tasks SET content = ?, updated_at = ? WHERE user_id = ?'
      ).run(lines.join('\n'), Date.now(), userId);
      return true;
    },

    /**
     * 设置用户心跳的启用状态
     * @param userId 用户ID
     * @param enabled 是否启用
     * @returns 是否操作成功
     */
    setEnabled(userId: string, enabled: boolean): boolean {
      const result = sqlite.query(
        'UPDATE heartbeat_tasks SET enabled = ?, updated_at = ? WHERE user_id = ?'
      ).run(enabled ? 1 : 0, Date.now(), userId);
      return result.changes > 0;
    },
  };
};

/** 心跳任务存储类型 */
export type HeartbeatTaskStore = ReturnType<typeof createHeartbeatTaskStore>;
