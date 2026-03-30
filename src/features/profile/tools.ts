/**
 * 用户档案功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的档案相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ProfileStore } from './store';
import type { UserProfile } from '../../store/schema';

/**
 * 获取用户档案的参数 Schema
 */
const GetProfileParamsSchema = Type.Object({}, { description: '无参数' });

/**
 * 更新用户档案的参数 Schema
 * 所有字段均为可选，只传入需要更新的字段
 * 注意：体重不再存储在档案中，使用 record_body 工具记录
 */
const UpdateProfileParamsSchema = Type.Object({
  height: Type.Optional(Type.Number({ description: '身高 cm' })),
  age: Type.Optional(Type.Number({ description: '年龄' })),
  gender: Type.Optional(Type.String({ description: '性别' })),
  diseases: Type.Optional(Type.Array(Type.String(), { description: '疾病史' })),
  allergies: Type.Optional(Type.Array(Type.String(), { description: '过敏史' })),
  dietPreferences: Type.Optional(Type.String({ description: '饮食偏好' })),
  healthGoal: Type.Optional(Type.String({ description: '健康目标' })),
});

/** 获取档案参数类型 */
type GetProfileParams = typeof GetProfileParamsSchema;
/** 更新档案参数类型 */
type UpdateProfileParams = typeof UpdateProfileParamsSchema;

/**
 * 创建用户档案相关的 Agent 工具
 * 包含获取档案和更新档案两个工具
 * @param store 用户档案存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 getProfile 和 updateProfile 的对象
 */
export const createProfileTools = (store: ProfileStore, userId: string) => {
  /**
   * 获取用户档案工具
   * 查询用户的个人健康档案，包括身高、年龄、疾病史、过敏史等信息
   * 注意：体重不再包含在档案中，应使用记录查询获取最新体重
   */
  const getProfile: AgentTool<GetProfileParams> = {
    name: 'get_profile',
    label: '获取用户档案',
    description: '获取用户的个人健康档案，包括身高、年龄、疾病史、过敏史、饮食偏好等。注意：体重不再存储在档案中。',
    parameters: GetProfileParamsSchema,
    execute: async (_toolCallId, _params, _signal) => {
      const profile = await store.get(userId);

      if (!profile) {
        return {
          content: [{ type: 'text', text: '用户尚未建立个人档案' }],
          details: { exists: false },
        };
      }

      // 解析 JSON 数组字段（疾病史和过敏史在数据库中存储为 JSON 字符串）
      const parsed = {
        ...profile,
        diseases: profile.diseases ? JSON.parse(profile.diseases) as string[] : [],
        allergies: profile.allergies ? JSON.parse(profile.allergies) as string[] : [],
      };

      return {
        content: [{ type: 'text', text: `用户档案: ${JSON.stringify(parsed, null, 2)}` }],
        details: { exists: true, profile: parsed },
      };
    },
  };

  /**
   * 更新用户档案工具
   * 创建或更新用户的个人健康档案，只传入需要更新的字段
   * 注意：体重不再存储在档案中，使用 record_body 工具记录
   */
  const updateProfile: AgentTool<UpdateProfileParams> = {
    name: 'update_profile',
    label: '更新用户档案',
    description: '更新用户的个人健康档案。注意：体重不再存储在档案中，请使用 record_body 工具记录体重。',
    parameters: UpdateProfileParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const data: Partial<Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt'>> = {};

      if (params.height !== undefined) data.height = params.height;
      if (params.age !== undefined) data.age = params.age;
      if (params.gender !== undefined) data.gender = params.gender;
      // 疾病史和过敏史是字符串数组，需要序列化为 JSON 字符串
      if (params.diseases !== undefined) data.diseases = JSON.stringify(params.diseases);
      if (params.allergies !== undefined) data.allergies = JSON.stringify(params.allergies);
      if (params.dietPreferences !== undefined) data.dietPreferences = params.dietPreferences;
      if (params.healthGoal !== undefined) data.healthGoal = params.healthGoal;

      const profile = await store.upsert(userId, data);

      return {
        content: [{ type: 'text', text: '用户档案已更新' }],
        details: { profile },
      };
    },
  };

  return { getProfile, updateProfile };
};
