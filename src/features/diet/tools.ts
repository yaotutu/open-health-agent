/**
 * 饮食功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的饮食相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { DietStore } from './store';
import { createQueryTool, createSimpleQueryTool } from '../../agent/tool-factory';

/**
 * 记录饮食的参数 Schema
 * 包含食物名称、热量及可选的营养成分（蛋白质、碳水、脂肪、钠）
 */
const RecordDietParamsSchema = Type.Object({
  food: Type.String({ description: '食物名称' }),
  calories: Type.Number({ description: '热量 kcal' }),
  protein: Type.Optional(Type.Number({ description: '蛋白质 g' })),
  carbs: Type.Optional(Type.Number({ description: '碳水化合物 g' })),
  fat: Type.Optional(Type.Number({ description: '脂肪 g' })),
  sodium: Type.Optional(Type.Number({ description: '钠 mg' })),
  mealType: Type.Optional(Type.String({ description: '餐次，如早餐、午餐、晚餐、加餐' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 记录饮食参数类型 */
type RecordDietParams = typeof RecordDietParamsSchema;

/**
 * 修改饮食记录的参数 Schema
 * 只需提供记录 ID 和要修改的字段
 */
const UpdateDietParamsSchema = Type.Object({
  id: Type.Number({ description: '记录ID' }),
  food: Type.Optional(Type.String({ description: '食物名称' })),
  calories: Type.Optional(Type.Number({ description: '热量 kcal' })),
  protein: Type.Optional(Type.Number({ description: '蛋白质 g' })),
  carbs: Type.Optional(Type.Number({ description: '碳水化合物 g' })),
  fat: Type.Optional(Type.Number({ description: '脂肪 g' })),
  sodium: Type.Optional(Type.Number({ description: '钠 mg' })),
  mealType: Type.Optional(Type.String({ description: '餐次' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 修改饮食记录参数类型 */
type UpdateDietParams = typeof UpdateDietParamsSchema;

/**
 * 创建饮食相关的 Agent 工具
 * 包含记录饮食和查询饮食记录两个工具
 * @param store 饮食记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordDiet 和 queryDietRecords 的对象
 */
export const createDietTools = (store: DietStore, userId: string) => {
  /**
   * 记录饮食工具
   * 记录用户的食物摄入和营养信息
   */
  const recordDiet: AgentTool<RecordDietParams> = {
    name: 'record_diet',
    label: '记录饮食',
    description: '记录用户的饮食摄入，包括食物名称、热量和营养成分（蛋白质、碳水、脂肪、钠）',
    parameters: RecordDietParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.record(userId, {
        food: params.food,
        calories: params.calories,
        protein: params.protein,
        carbs: params.carbs,
        fat: params.fat,
        sodium: params.sodium,
        mealType: params.mealType,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录饮食: ${record.food} ${record.calories}kcal${record.mealType ? ` (${record.mealType})` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /** 查询饮食记录 */
  const queryDietRecords = createQueryTool({
    name: 'query_diet_records',
    label: '查询饮食记录',
    description: '查询用户的饮食记录，支持按时间范围筛选。',
    queryFn: (options) => store.query(userId, options),
  });

  /**
   * 修改饮食记录工具
   */
  const updateDietRecord: AgentTool<UpdateDietParams> = {
    name: 'update_diet_record',
    label: '修改饮食记录',
    description: '修改已有的饮食记录。只需提供要修改的字段。',
    parameters: UpdateDietParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const { id, ...fields } = params;
      const updates = Object.fromEntries(Object.entries(fields).filter(([_, v]) => v !== undefined));
      if (Object.keys(updates).length === 0) return { content: [{ type: 'text', text: '没有需要修改的字段' }], details: {} };
      try {
        const record = await store.update(userId, id, updates);
        return { content: [{ type: 'text', text: `已修改饮食记录 ID ${id}` }], details: { record } };
      } catch (err) {
        return { content: [{ type: 'text', text: `修改失败: ${(err as Error).message}` }], details: {} };
      }
    },
  };

  return { recordDiet, queryDietRecords, updateDietRecord };
};

/**
 * 创建饮食记录极简查询工具（无参数，返回最近记录）
 * 用于常驻上下文场景，让 LLM 无需传参即可快速获取最近的饮食记录
 */
export const createDietSimpleQuery = (store: DietStore, userId: string) =>
  createSimpleQueryTool({
    name: 'get_recent_diet',
    description: '获取最近7天饮食记录',
    queryFn: () => store.query(userId, { limit: 10 }),
  });
