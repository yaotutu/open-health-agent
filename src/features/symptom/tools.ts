/**
 * 症状功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的症状相关工具
 *
 * 症状工具包含三个工具：record_symptom、query_symptom_records、resolve_symptom
 * 其中 resolve_symptom 是症状功能独有的工具，用于标记症状已解决
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { SymptomStore } from './store';
import { createQueryTool, createSimpleQueryTool } from '../../agent/tool-factory';

/**
 * 记录症状的参数 Schema
 */
const RecordSymptomParamsSchema = Type.Object({
  description: Type.String({ description: '症状描述，如"胃痛"、"头痛"、"恶心"等' }),
  severity: Type.Optional(Type.Number({ description: '严重程度 1-10，10为最严重' })),
  bodyPart: Type.Optional(Type.String({ description: '身体部位，如"胃部"、"头部"、"胸部"等' })),
  relatedType: Type.Optional(Type.String({ description: '关联记录类型，如diet、exercise等（可选）' })),
  relatedId: Type.Optional(Type.Number({ description: '关联记录ID（可选）' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 记录症状参数类型 */
type RecordSymptomParams = typeof RecordSymptomParamsSchema;

/**
 * 标记症状已解决的参数 Schema
 * 需要提供症状记录的 ID
 */
const ResolveSymptomParamsSchema = Type.Object({
  symptomId: Type.Number({ description: '症状记录ID' }),
});

/** 标记症状已解决参数类型 */
type ResolveSymptomParams = typeof ResolveSymptomParamsSchema;

/**
 * 修改症状记录的参数 Schema
 * 只需提供记录 ID 和要修改的字段
 */
const UpdateSymptomParamsSchema = Type.Object({
  id: Type.Number({ description: '记录ID' }),
  description: Type.Optional(Type.String({ description: '症状描述' })),
  severity: Type.Optional(Type.Number({ description: '严重程度 1-10' })),
  bodyPart: Type.Optional(Type.String({ description: '身体部位' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 修改症状记录参数类型 */
type UpdateSymptomParams = typeof UpdateSymptomParamsSchema;

/**
 * 创建症状相关的 Agent 工具
 * 包含记录症状、查询症状记录和标记症状已解决三个工具
 * @param store 症状记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordSymptom、querySymptomRecords 和 resolveSymptom 的对象
 */
export const createSymptomTools = (store: SymptomStore, userId: string) => {
  /**
   * 记录症状工具
   * 记录用户的身体不适、症状等信息
   * 支持关联其他记录类型，帮助追踪症状诱因
   */
  const recordSymptom: AgentTool<RecordSymptomParams> = {
    name: 'record_symptom',
    label: '记录症状',
    description: '记录用户的身体不适或症状，如胃痛、头痛等。可关联相关记录（如某次饮食）帮助分析诱因。',
    parameters: RecordSymptomParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.record(userId, {
        description: params.description,
        severity: params.severity,
        bodyPart: params.bodyPart,
        relatedType: params.relatedType,
        relatedId: params.relatedId,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录症状: ${record.description}${record.severity ? ` (严重程度 ${record.severity}/10)` : ''}${record.bodyPart ? ` - ${record.bodyPart}` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /** 查询症状记录 */
  const querySymptomRecords = createQueryTool({
    name: 'query_symptom_records',
    label: '查询症状记录',
    description: '查询用户的症状/不适记录，支持按时间范围筛选。',
    queryFn: (options) => store.query(userId, options),
  });

  /**
   * 标记症状已解决工具
   * 将指定症状记录的 resolved_at 字段更新为当前时间
   * 这是症状功能独有的工具，其他记录类型没有此功能
   */
  const resolveSymptom: AgentTool<ResolveSymptomParams> = {
    name: 'resolve_symptom',
    label: '标记症状已解决',
    description: '将指定症状标记为已解决。',
    parameters: ResolveSymptomParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.resolve(userId, params.symptomId);
      return {
        content: [{ type: 'text', text: `已标记症状为已解决: ${record.description}` }],
        details: { record },
      };
    },
  };

  /**
   * 修改症状记录工具
   */
  const updateSymptomRecord: AgentTool<UpdateSymptomParams> = {
    name: 'update_symptom_record',
    label: '修改症状记录',
    description: '修改已有的症状记录。只需提供要修改的字段。',
    parameters: UpdateSymptomParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const { id, ...fields } = params;
      const updates = Object.fromEntries(Object.entries(fields).filter(([_, v]) => v !== undefined));
      if (Object.keys(updates).length === 0) return { content: [{ type: 'text', text: '没有需要修改的字段' }], details: {} };
      try {
        const record = await store.update(userId, id, updates);
        return { content: [{ type: 'text', text: `已修改症状记录 ID ${id}` }], details: { record } };
      } catch (err) {
        return { content: [{ type: 'text', text: `修改失败: ${(err as Error).message}` }], details: {} };
      }
    },
  };

  return { recordSymptom, querySymptomRecords, resolveSymptom, updateSymptomRecord };
};

/**
 * 创建症状记录极简查询工具（无参数，返回最近记录）
 * 用于常驻上下文场景，让 LLM 无需传参即可快速获取最近的症状记录
 */
export const createSymptomSimpleQuery = (store: SymptomStore, userId: string) =>
  createSimpleQueryTool({
    name: 'get_recent_symptoms',
    description: '获取最近7天症状记录',
    queryFn: () => store.query(userId, { limit: 10 }),
  });
