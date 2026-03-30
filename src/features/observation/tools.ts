/**
 * 健康观察功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的健康观察相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ObservationStore } from './store';
import { createQueryTool } from '../../agent/tool-factory';
import { safeJsonParse } from '../../store/json-utils';

/**
 * 记录健康观察的参数 Schema
 */
const RecordObservationParamsSchema = Type.Object({
  content: Type.String({ description: '观察内容，如"最近睡眠不好"、"感觉压力大"' }),
  tags: Type.Optional(Type.Array(Type.String(), { description: '标签列表，如 ["睡眠","疲劳"]' })),
});

/** 记录健康观察参数类型 */
type RecordObservationParams = typeof RecordObservationParamsSchema;

/**
 * 查询健康观察的参数 Schema
 */
const QueryObservationsParamsSchema = Type.Object({
  startTime: Type.Optional(Type.Number({ description: '起始时间戳（毫秒）' })),
  endTime: Type.Optional(Type.Number({ description: '结束时间戳（毫秒）' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认10' })),
});

/** 查询健康观察参数类型 */
type QueryObservationsParams = typeof QueryObservationsParamsSchema;

/**
 * 创建健康观察相关的 Agent 工具
 * 包含记录健康观察和查询健康观察记录两个工具
 * @param store 健康观察记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordObservation 和 queryObservations 的对象
 */
export const createObservationTools = (store: ObservationStore, userId: string) => {
  /**
   * 记录健康观察工具
   * 记录用户的非结构化健康观察，如"最近睡眠不好"、"感觉压力大"等
   */
  const recordObservation: AgentTool<RecordObservationParams> = {
    name: 'record_observation',
    label: '记录健康观察',
    description: '记录用户的健康观察或感受，如"最近睡眠不好"、"感觉压力大"等模糊描述。',
    parameters: RecordObservationParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.record(userId, {
        content: params.content,
        tags: params.tags,
      });

      return {
        content: [{ type: 'text', text: `已记录观察: ${record.content}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 查询健康观察工具
   * 查询用户的健康观察记录
   * 注意：tags 字段在数据库中存储为 JSON 字符串，查询时需要解析为数组
   */
  const queryObservations: AgentTool<QueryObservationsParams> = {
    name: 'query_observations',
    label: '查询健康观察',
    description: '查询用户的健康观察记录，支持按时间范围筛选。',
    parameters: QueryObservationsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        limit: params.limit,
      });

      // 解析 tags JSON 字段（数据库中存储为 JSON 字符串）
      // 使用 safeJsonParse 防止损坏数据导致解析崩溃
      const parsed = records.map(r => ({
        ...r,
        tags: safeJsonParse<string[]>(r.tags, []),
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ records: parsed, count: parsed.length }) }],
        details: { records: parsed, count: parsed.length },
      };
    },
  };

  return { recordObservation, queryObservations };
};
