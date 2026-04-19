/**
 * 睡眠功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的睡眠相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { SleepStore } from './store';
import { createQueryTool, createSimpleQueryTool } from '../../agent/tool-factory';

/**
 * 记录睡眠的参数 Schema
 */
const RecordSleepParamsSchema = Type.Object({
  duration: Type.Number({ description: '睡眠时长 分钟' }),
  quality: Type.Optional(Type.Number({ description: '睡眠质量 1-5，5为最好' })),
  bedTime: Type.Optional(Type.String({ description: '入睡时间，格式 "YYYY-MM-DD HH:mm"，如 "2026-03-28 02:00"' })),
  wakeTime: Type.Optional(Type.String({ description: '醒来时间，格式 "YYYY-MM-DD HH:mm"，如 "2026-03-28 08:00"' })),
  deepSleep: Type.Optional(Type.Number({ description: '深睡时长 分钟' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 记录睡眠参数类型 */
type RecordSleepParams = typeof RecordSleepParamsSchema;

/**
 * 修改睡眠记录的参数 Schema
 * 只需提供记录 ID 和要修改的字段
 */
const UpdateSleepParamsSchema = Type.Object({
  id: Type.Number({ description: '记录ID' }),
  duration: Type.Optional(Type.Number({ description: '睡眠时长 分钟' })),
  quality: Type.Optional(Type.Number({ description: '睡眠质量 1-5' })),
  bedTime: Type.Optional(Type.String({ description: '入睡时间，格式 "YYYY-MM-DD HH:mm"' })),
  wakeTime: Type.Optional(Type.String({ description: '醒来时间，格式 "YYYY-MM-DD HH:mm"' })),
  deepSleep: Type.Optional(Type.Number({ description: '深睡时长 分钟' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 修改睡眠记录参数类型 */
type UpdateSleepParams = typeof UpdateSleepParamsSchema;

/**
 * 解析日期时间字符串为毫秒时间戳
 * LLM 传入格式为 "YYYY-MM-DD HH:mm"，由代码负责转换，避免 LLM 计算时间戳出错
 * @param str 日期时间字符串，支持 "YYYY-MM-DD HH:mm" 或 "YYYY-MM-DDTHH:mm" 格式
 * @returns 毫秒时间戳，解析失败返回 undefined
 */
const parseDateTime = (str: string | undefined): number | undefined => {
  if (!str) return undefined;
  // 支持 "YYYY-MM-DD HH:mm" 或 "YYYY-MM-DDTHH:mm" 格式
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})/);
  if (match) {
    return new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]).getTime();
  }
  // 尝试直接解析
  const d = new Date(str);
  return isNaN(d.getTime()) ? undefined : d.getTime();
};

/**
 * 创建睡眠相关的 Agent 工具
 * 包含记录睡眠和查询睡眠记录两个工具
 * @param store 睡眠记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordSleep 和 querySleepRecords 的对象
 */
export const createSleepTools = (store: SleepStore, userId: string) => {
  /**
   * 记录睡眠工具
   * 记录用户的睡眠数据
   */
  const recordSleep: AgentTool<RecordSleepParams> = {
    name: 'record_sleep',
    label: '记录睡眠',
    description: '记录用户的睡眠数据，包括时长、质量、入睡和醒来时间等',
    parameters: RecordSleepParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.record(userId, {
        duration: params.duration,
        quality: params.quality,
        bedTime: parseDateTime(params.bedTime),
        wakeTime: parseDateTime(params.wakeTime),
        deepSleep: params.deepSleep,
        note: params.note,
      });

      const duration = record.duration ?? 0;
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;
      return {
        content: [{ type: 'text', text: `已记录睡眠: ${hours}小时${mins}分钟${record.quality ? ` (质量 ${record.quality}/5)` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /** 查询睡眠记录 */
  const querySleepRecords = createQueryTool({
    name: 'query_sleep_records',
    label: '查询睡眠记录',
    description: '查询用户的睡眠记录，支持按时间范围筛选。',
    queryFn: (options) => store.query(userId, options),
  });

  /**
   * 修改睡眠记录工具
   */
  const updateSleepRecord: AgentTool<UpdateSleepParams> = {
    name: 'update_sleep_record',
    label: '修改睡眠记录',
    description: '修改已有的睡眠记录。只需提供要修改的字段。',
    parameters: UpdateSleepParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const { id, ...fields } = params;
      // bedTime/wakeTime 需要从字符串转为时间戳
      const updates: Record<string, any> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        if (key === 'bedTime') { updates.bedTime = parseDateTime(value as string | undefined); continue; }
        if (key === 'wakeTime') { updates.wakeTime = parseDateTime(value as string | undefined); continue; }
        updates[key] = value;
      }
      if (Object.keys(updates).length === 0) return { content: [{ type: 'text', text: '没有需要修改的字段' }], details: {} };
      try {
        const record = await store.update(userId, id, updates);
        return { content: [{ type: 'text', text: `已修改睡眠记录 ID ${id}` }], details: { record } };
      } catch (err) {
        return { content: [{ type: 'text', text: `修改失败: ${(err as Error).message}` }], details: {} };
      }
    },
  };

  return { recordSleep, querySleepRecords, updateSleepRecord };
};

/**
 * 创建睡眠记录极简查询工具（无参数，返回最近记录）
 * 用于常驻上下文场景，让 LLM 无需传参即可快速获取最近的睡眠记录
 */
export const createSleepSimpleQuery = (store: SleepStore, userId: string) =>
  createSimpleQueryTool({
    name: 'get_recent_sleep',
    description: '获取最近7天睡眠记录',
    queryFn: () => store.query(userId, { limit: 10 }),
  });
