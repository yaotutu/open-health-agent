/**
 * 运动功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的运动相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ExerciseStore } from './store';
import { createQueryTool } from '../../agent/tool-factory';

/**
 * 记录运动的参数 Schema
 */
const RecordExerciseParamsSchema = Type.Object({
  type: Type.String({ description: '运动类型，如跑步、游泳、瑜伽等' }),
  duration: Type.Number({ description: '运动时长 分钟' }),
  calories: Type.Optional(Type.Number({ description: '消耗热量 kcal' })),
  heartRateAvg: Type.Optional(Type.Number({ description: '平均心率 bpm' })),
  heartRateMax: Type.Optional(Type.Number({ description: '最大心率 bpm' })),
  distance: Type.Optional(Type.Number({ description: '距离 km' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 记录运动参数类型 */
type RecordExerciseParams = typeof RecordExerciseParamsSchema;

/**
 * 创建运动相关的 Agent 工具
 * 包含记录运动和查询运动记录两个工具
 * @param store 运动记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordExercise 和 queryExerciseRecords 的对象
 */
export const createExerciseTools = (store: ExerciseStore, userId: string) => {
  /**
   * 记录运动工具
   * 记录用户的运动活动和相关数据
   */
  const recordExercise: AgentTool<RecordExerciseParams> = {
    name: 'record_exercise',
    label: '记录运动',
    description: '记录用户的运动活动，包括类型、时长、消耗热量、心率等',
    parameters: RecordExerciseParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.record(userId, {
        type: params.type,
        duration: params.duration,
        calories: params.calories,
        heartRateAvg: params.heartRateAvg,
        heartRateMax: params.heartRateMax,
        distance: params.distance,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录运动: ${record.type} ${record.duration}分钟${record.calories ? `, 消耗 ${record.calories}kcal` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /** 查询运动记录 */
  const queryExerciseRecords = createQueryTool({
    name: 'query_exercise_records',
    label: '查询运动记录',
    description: '查询用户的运动记录，支持按时间范围筛选。',
    queryFn: (options) => store.query(userId, options),
  });

  return { recordExercise, queryExerciseRecords };
};
