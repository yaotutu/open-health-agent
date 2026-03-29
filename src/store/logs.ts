import type { Database } from 'bun:sqlite';

/**
 * 日志记录接口
 * 对应 logs 表的一行记录
 */
export interface LogRecord {
  /** 自增主键 */
  id: number;
  /** 日志级别：trace/debug/info/warn/error/fatal */
  level: number;
  /** 日志级别名称 */
  levelName: string;
  /** 日志消息 */
  msg: string;
  /** 时间戳（ISO 字符串） */
  time: string;
  /** 附加数据 JSON */
  data: string | null;
  /** 模块标签（如 app, llm, handler） */
  module: string | null;
}

/**
 * 日志级别映射
 * Pino 使用数字表示级别，这里转换为可读名称
 */
const LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

/**
 * 创建日志存储模块
 * 所有日志写入 logs 表，不输出到控制台
 * @param sqlite 底层 SQLite 连接（使用原生 SQL 以获得更好的性能）
 */
export const createLogStore = (sqlite: Database) => {
  // 预编译插入语句，提高批量写入性能
  const insertStmt = sqlite.prepare(
    'INSERT INTO logs (level, level_name, msg, time, data, module) VALUES (?, ?, ?, ?, ?, ?)'
  );

  /**
   * 写入一条日志记录
   * @param level Pino 日志级别数字
   * @param msg 日志消息
   * @param time ISO 时间戳
   * @param data 附加数据对象（会序列化为 JSON）
   * @param module 模块标签
   */
  const write = (level: number, msg: string, time: string, data?: string | null, module?: string | null) => {
    try {
      insertStmt.run(level, LEVEL_NAMES[level] || 'unknown', msg, time, data ?? null, module ?? null);
    } catch {
      // 日志写入失败时静默处理，避免无限循环
    }
  };

  /**
   * 查询最近的日志记录
   * @param limit 返回条数，默认 100
   * @param level 最低日志级别过滤，默认 info(30)
   */
  const getRecent = (limit = 100, level = 30): LogRecord[] => {
    return sqlite.prepare(
      'SELECT * FROM logs WHERE level >= ? ORDER BY id DESC LIMIT ?'
    ).all(level, limit) as LogRecord[];
  };

  /**
   * 按模块查询日志
   * @param module 模块名称（如 llm, handler）
   * @param limit 返回条数
   */
  const getByModule = (module: string, limit = 100): LogRecord[] => {
    return sqlite.prepare(
      'SELECT * FROM logs WHERE module = ? ORDER BY id DESC LIMIT ?'
    ).all(module, limit) as LogRecord[];
  };

  /**
   * 清理旧日志，保留最近 N 天的记录
   * @param days 保留天数，默认 7 天
   */
  const purge = (days = 7): number => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = sqlite.prepare('DELETE FROM logs WHERE time < ?').run(cutoff);
    return result.changes;
  };

  return { write, getRecent, getByModule, purge };
};

export type LogStore = ReturnType<typeof createLogStore>;
