/**
 * 身体数据功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的身体数据相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { BodyStore } from './store';
import { createQueryTool, createSimpleQueryTool } from '../../agent/tool-factory';

/**
 * 记录身体数据的参数 Schema
 */
const RecordBodyParamsSchema = Type.Object({
  weight: Type.Number({ description: '体重 kg' }),
  bodyFat: Type.Optional(Type.Number({ description: '体脂率 %' })),
  bmi: Type.Optional(Type.Number({ description: 'BMI 指数' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 记录身体数据参数类型 */
type RecordBodyParams = typeof RecordBodyParamsSchema;

/**
 * 创建身体数据相关的 Agent 工具
 * 包含记录身体数据和查询身体数据记录两个工具
 * @param store 身体数据存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordBody 和 queryBodyRecords 的对象
 */
export const createBodyTools = (store: BodyStore, userId: string) => {
  /**
   * 记录身体数据工具
   * 记录用户的体重、体脂率、BMI 等身体指标
   */
  const recordBody: AgentTool<RecordBodyParams> = {
    name: 'record_body',
    label: '记录身体数据',
    description: '记录用户的身体数据，如体重、体脂率、BMI。体重应使用此工具记录，不再存储在档案中。',
    parameters: RecordBodyParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.record(userId, {
        weight: params.weight,
        bodyFat: params.bodyFat,
        bmi: params.bmi,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录身体数据: 体重 ${record.weight}kg${record.bodyFat ? `, 体脂 ${record.bodyFat}%` : ''} (${new Date(record.timestamp).toISOString()})` }],
        details: { id: record.id, record },
      };
    },
  };

  /** 查询身体数据记录（体重、体脂率、BMI） */
  const queryBodyRecords = createQueryTool({
    name: 'query_body_records',
    label: '查询身体数据',
    description: '查询用户的身体数据记录（体重、体脂率、BMI等），支持按时间范围筛选。',
    queryFn: (options) => store.query(userId, options),
  });

  return { recordBody, queryBodyRecords };
};

/**
 * 创建身体数据极简查询工具（无参数，返回最近记录）
 * 用于常驻上下文场景，让 LLM 无需传参即可快速获取最近的身体数据
 */
export const createBodySimpleQuery = (store: BodyStore, userId: string) =>
  createSimpleQueryTool({
    name: 'get_recent_body',
    description: '获取最近7天身体数据',
    queryFn: () => store.query(userId, { limit: 10 }),
  });
