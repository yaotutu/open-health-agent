/**
 * 饮食功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的饮食相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { DietStore } from './store';
import { createQueryTool } from '../../agent/tool-factory';

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

  return { recordDiet, queryDietRecords };
};
