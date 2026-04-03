/**
 * 饮水功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的饮水相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { WaterStore } from './store';
import { createQueryTool, createSimpleQueryTool } from '../../agent/tool-factory';

/**
 * 记录饮水的参数 Schema
 */
const RecordWaterParamsSchema = Type.Object({
  amount: Type.Number({ description: '饮水量 ml' }),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 记录饮水参数类型 */
type RecordWaterParams = typeof RecordWaterParamsSchema;

/**
 * 创建饮水相关的 Agent 工具
 * 包含记录饮水和查询饮水记录两个工具
 * @param store 饮水记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordWater 和 queryWaterRecords 的对象
 */
export const createWaterTools = (store: WaterStore, userId: string) => {
  /**
   * 记录饮水工具
   * 记录用户的饮水量
   */
  const recordWater: AgentTool<RecordWaterParams> = {
    name: 'record_water',
    label: '记录饮水',
    description: '记录用户的饮水量（ml）',
    parameters: RecordWaterParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.record(userId, {
        amount: params.amount,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录饮水: ${record.amount}ml` }],
        details: { id: record.id, record },
      };
    },
  };

  /** 查询饮水记录 */
  const queryWaterRecords = createQueryTool({
    name: 'query_water_records',
    label: '查询饮水记录',
    description: '查询用户的饮水记录，支持按时间范围筛选。',
    queryFn: (options) => store.query(userId, options),
  });

  return { recordWater, queryWaterRecords };
};

/**
 * 创建饮水记录极简查询工具（无参数，返回最近记录）
 * 用于常驻上下文场景，让 LLM 无需传参即可快速获取最近的饮水记录
 */
export const createWaterSimpleQuery = (store: WaterStore, userId: string) =>
  createSimpleQueryTool({
    name: 'get_recent_water',
    description: '获取最近7天饮水记录',
    queryFn: () => store.query(userId, { limit: 10 }),
  });
