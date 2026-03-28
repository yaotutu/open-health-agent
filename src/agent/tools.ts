import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Store, HealthRecord, UserProfile } from '../store';

/**
 * 记录健康数据的参数 Schema
 * 定义了记录健康数据时需要的参数结构，包括数据类型、数值、单位和备注
 */
const RecordParamsSchema = Type.Object({
  type: Type.Union([
    Type.Literal('weight'),
    Type.Literal('sleep'),
    Type.Literal('diet'),
    Type.Literal('exercise'),
    Type.Literal('water'),
  ], { description: '数据类型' }),
  value: Type.Number({ description: '数值' }),
  unit: Type.Optional(Type.String({ description: '单位，如 kg、小时、杯' })),
  note: Type.Optional(Type.String({ description: '备注' })),
  // 饮食详情字段，仅 diet 类型使用，包含食物名称和营养信息
  detail: Type.Optional(Type.Object({
    food: Type.String({ description: '食物名称' }),
    calories: Type.Number({ description: '估算热量 kcal' }),
    protein: Type.Optional(Type.Number({ description: '蛋白质 g' })),
    carbs: Type.Optional(Type.Number({ description: '碳水化合物 g' })),
    fat: Type.Optional(Type.Number({ description: '脂肪 g' })),
  }, { description: '饮食详情，仅 diet 类型使用' })),
});

/**
 * 查询健康数据的参数 Schema
 * 定义了查询历史健康数据时的筛选条件
 */
const QueryParamsSchema = Type.Object({
  type: Type.Optional(Type.Union([
    Type.Literal('weight'),
    Type.Literal('sleep'),
    Type.Literal('diet'),
    Type.Literal('exercise'),
    Type.Literal('water'),
  ], { description: '数据类型，不填则查询所有类型' })),
  days: Type.Optional(Type.Number({ description: '查询最近N天的数据，默认7天' })),
  limit: Type.Optional(Type.Number({ description: '最多返回多少条记录，默认10条' })),
});

/**
 * 获取用户档案的参数 Schema
 * 无需任何参数，仅根据 userId 获取档案
 */
const GetProfileParamsSchema = Type.Object({}, { description: '无参数' });

/**
 * 更新用户档案的参数 Schema
 * 所有字段均为可选，只传入需要更新的字段
 */
const UpdateProfileParamsSchema = Type.Object({
  height: Type.Optional(Type.Number({ description: '身高 cm' })),
  weight: Type.Optional(Type.Number({ description: '体重 kg' })),
  age: Type.Optional(Type.Number({ description: '年龄' })),
  gender: Type.Optional(Type.String({ description: '性别' })),
  diseases: Type.Optional(Type.Array(Type.String(), { description: '疾病史' })),
  allergies: Type.Optional(Type.Array(Type.String(), { description: '过敏史' })),
  dietPreferences: Type.Optional(Type.String({ description: '饮食偏好' })),
  healthGoal: Type.Optional(Type.String({ description: '健康目标' })),
});

/**
 * 分析饮食数据的参数 Schema
 * 可指定统计天数，默认为 7 天
 */
const AnalyzeDietParamsSchema = Type.Object({
  days: Type.Optional(Type.Number({ description: '统计最近N天的饮食数据，默认7天' })),
});

type RecordParams = typeof RecordParamsSchema;
type QueryParams = typeof QueryParamsSchema;
type GetProfileParams = typeof GetProfileParamsSchema;
type UpdateProfileParams = typeof UpdateProfileParamsSchema;
type AnalyzeDietParams = typeof AnalyzeDietParamsSchema;

/**
 * 创建 Agent 工具集
 * 根据传入的 Store 实例和用户 ID，创建所有可用的 Agent 工具
 * @param store 数据存储实例，提供健康记录、用户档案等数据操作
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含所有 Agent 工具的对象
 */
export const createTools = (store: Store, userId: string) => {
  /**
   * 记录健康数据工具
   * 允许 Agent 记录用户的各类健康数据（体重、睡眠、饮食、运动、饮水）
   * 饮食类型支持额外的 detail 字段记录营养信息
   */
  const record: AgentTool<RecordParams> = {
    name: 'record_health_data',
    label: '记录健康数据',
    description: '记录用户的健康数据，如体重、睡眠、饮食、运动、饮水量',
    parameters: RecordParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.health.record({
        userId,
        type: params.type as HealthRecord['type'],
        value: params.value,
        unit: params.unit,
        note: params.note,
        // 将 detail 对象序列化为 JSON 字符串存储
        detail: params.detail ? JSON.stringify(params.detail) : undefined,
      });

      // 如果有 detail，在回复中包含营养信息
      let detailText = '';
      if (params.detail) {
        detailText = ` (${params.detail.food}, ${params.detail.calories}kcal)`;
      }

      return {
        content: [{ type: 'text', text: `已记录: ${record.type} ${record.value}${record.unit || ''}${detailText} (${new Date(record.timestamp).toISOString()})` }],
        details: { id: record.id },
      };
    },
  };

  /**
   * 查询健康数据工具
   * 允许 Agent 查询用户的历史健康记录，支持按类型和时间范围筛选
   */
  const query: AgentTool<QueryParams> = {
    name: 'query_health_data',
    label: '查询健康数据',
    description: '查询用户的历史健康数据',
    parameters: QueryParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.health.query({
        userId,
        type: params.type as HealthRecord['type'] | undefined,
        days: params.days ?? 7,
        limit: params.limit ?? 10,
      });

      if (records.length === 0) {
        return {
          content: [{ type: 'text', text: '没有找到符合条件的健康数据记录。' }],
          details: { count: 0 },
        };
      }

      const lines = records.map(r => {
        const date = new Date(r.timestamp).toLocaleDateString('zh-CN');
        return `- ${date} ${r.type}: ${r.value}${r.unit || ''}${r.note ? ` (${r.note})` : ''}`;
      });

      return {
        content: [{ type: 'text', text: `找到 ${records.length} 条记录:\n${lines.join('\n')}` }],
        details: { count: records.length, records },
      };
    },
  };

  /**
   * 获取用户档案工具
   * 查询用户的个人健康档案，包括身高、体重、疾病史、过敏史等信息
   * 数据库中的疾病史和过敏史以 JSON 数组字符串存储，需要解析为数组返回
   */
  const getProfile: AgentTool<GetProfileParams> = {
    name: 'get_profile',
    label: '获取用户档案',
    description: '获取用户的个人健康档案，包括身高、体重、疾病史、过敏史、饮食偏好等',
    parameters: GetProfileParamsSchema,
    execute: async (_toolCallId, _params, _signal) => {
      // 从数据库获取用户档案
      const profile = await store.profile.get(userId);

      // 档案不存在时返回提示信息
      if (!profile) {
        return {
          content: [{ type: 'text', text: '用户尚未建立个人档案' }],
          details: {},
        };
      }

      // 解析 JSON 数组字段：疾病史和过敏史在数据库中以 JSON 字符串形式存储
      const parsed = {
        ...profile,
        diseases: profile.diseases ? JSON.parse(profile.diseases) as string[] : [],
        allergies: profile.allergies ? JSON.parse(profile.allergies) as string[] : [],
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(parsed) }],
        details: { profile: parsed },
      };
    },
  };

  /**
   * 更新用户档案工具
   * 创建或更新用户的个人健康档案，只传入需要更新的字段
   * 数组类型字段（疾病史、过敏史）会被序列化为 JSON 字符串存储
   */
  const updateProfile: AgentTool<UpdateProfileParams> = {
    name: 'update_profile',
    label: '更新用户档案',
    description: '更新用户的个人健康档案，只传入需要更新的字段',
    parameters: UpdateProfileParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      // 构建更新数据对象，只包含传入了的字段
      const data: Partial<Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt'>> = {};

      if (params.height !== undefined) data.height = params.height;
      if (params.weight !== undefined) data.weight = params.weight;
      if (params.age !== undefined) data.age = params.age;
      if (params.gender !== undefined) data.gender = params.gender;
      // 疾病史和过敏史是字符串数组，需要序列化为 JSON 字符串存入数据库
      if (params.diseases !== undefined) data.diseases = JSON.stringify(params.diseases);
      if (params.allergies !== undefined) data.allergies = JSON.stringify(params.allergies);
      if (params.dietPreferences !== undefined) data.dietPreferences = params.dietPreferences;
      if (params.healthGoal !== undefined) data.healthGoal = params.healthGoal;

      // 执行 upsert 操作：档案存在则更新，不存在则创建
      const profile = await store.profile.upsert(userId, data);

      return {
        content: [{ type: 'text', text: '用户档案已更新' }],
        details: { profile },
      };
    },
  };

  /**
   * 分析饮食数据工具
   * 获取用户近期的饮食统计聚合数据，包括每日营养摄入汇总和食物频次
   * 注意：store.health.analyze 是同步方法（bun-sqlite 驱动特性），但在 async 函数中直接使用即可
   */
  const analyzeDiet: AgentTool<AnalyzeDietParams> = {
    name: 'analyze_diet',
    label: '分析饮食数据',
    description: '获取用户近期饮食数据的统计聚合，包括每日营养汇总和食物频次。返回原始数据供分析。',
    parameters: AnalyzeDietParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      // 调用同步的 analyze 方法获取饮食分析结果
      const result = store.health.analyze(userId, params.days ?? 7);

      // 格式化每日营养汇总信息
      const dailyLines = result.dailySummary.map(d =>
        `  ${d.date}: ${d.meals}餐, ${d.calories}kcal, 蛋白质${d.protein}g, 碳水${d.carbs}g, 脂肪${d.fat}g`
      );

      // 格式化食物频次信息
      const foodLines = result.foodFrequency.map(f =>
        `  ${f.food}: ${f.count}次`
      );

      // 构建可读的分析报告文本
      const text = [
        `最近${result.days}天饮食统计:`,
        '',
        '每日营养汇总:',
        ...dailyLines,
        '',
        '食物频次:',
        ...foodLines,
      ].join('\n');

      return {
        content: [{ type: 'text', text }],
        details: { analysis: result },
      };
    },
  };

  return { record, query, getProfile, updateProfile, analyzeDiet };
};
