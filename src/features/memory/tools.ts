/**
 * 记忆功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的记忆相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { MemoryStore } from './store';

// ==================== 记忆工具参数 Schema ====================

/**
 * 保存记忆的参数 Schema
 * 用于将用户偏好、反馈或重要事实存储为长期记忆
 */
const SaveMemoryParamsSchema = Type.Object({
  content: Type.String({ description: '记忆内容，如用户偏好、反馈或重要事实' }),
  category: Type.Optional(Type.String({ description: '分类：feedback(反馈)/preference(偏好)/fact(事实)' })),
});

/**
 * 查询记忆的参数 Schema
 * 支持按分类过滤和限制返回数量
 */
const QueryMemoriesParamsSchema = Type.Object({
  category: Type.Optional(Type.String({ description: '按分类过滤' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认20' })),
});

/**
 * 删除记忆的参数 Schema
 * 需要提供要删除的记忆 ID
 */
const DeleteMemoryParamsSchema = Type.Object({
  memoryId: Type.Number({ description: '记忆ID' }),
});

// ==================== 工具类型定义 ====================

type SaveMemoryParams = typeof SaveMemoryParamsSchema;
type QueryMemoriesParams = typeof QueryMemoriesParamsSchema;
type DeleteMemoryParams = typeof DeleteMemoryParamsSchema;

// ==================== 工具创建函数 ====================

/**
 * 创建记忆相关的 Agent 工具
 * 包含保存记忆、查询记忆和删除记忆三个工具
 * @param store 记忆存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 saveMemory、queryMemories 和 deleteMemory 的对象
 */
export const createMemoryTools = (store: MemoryStore, userId: string) => {
  /**
   * 保存记忆工具
   * 将 Agent 从对话中提取的关键信息（如用户偏好、反馈、健康事实）存储为长期记忆
   * 这些记忆会在后续对话中被使用，实现跨会话的个性化服务
   */
  const saveMemory: AgentTool<SaveMemoryParams> = {
    name: 'save_memory',
    label: '保存记忆',
    description: '保存一条关于用户的长期记忆，如偏好、反馈或重要事实。',
    parameters: SaveMemoryParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.save(userId, {
        content: params.content,
        category: params.category,
      });
      return {
        content: [{ type: 'text', text: `已保存记忆: ${record.content}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 查询记忆工具
   * 查询已保存的用户记忆，支持按分类过滤
   * 用于在对话中回忆用户的偏好、反馈或健康事实
   */
  const queryMemories: AgentTool<QueryMemoriesParams> = {
    name: 'query_memories',
    label: '查询记忆',
    description: '查询已保存的关于用户的记忆，可按分类过滤。',
    parameters: QueryMemoriesParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.query(userId, {
        category: params.category,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  /**
   * 删除记忆工具
   * 根据记忆 ID 删除指定的长期记忆记录
   * 用于清理过时或错误的记忆信息
   */
  const deleteMemory: AgentTool<DeleteMemoryParams> = {
    name: 'delete_memory',
    label: '删除记忆',
    description: '删除指定的一条长期记忆。',
    parameters: DeleteMemoryParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const success = await store.remove(userId, params.memoryId);
      return {
        content: [{ type: 'text', text: success ? `已删除记忆 ID: ${params.memoryId}` : `未找到记忆 ID: ${params.memoryId}` }],
        details: { success },
      };
    },
  };

  return { saveMemory, queryMemories, deleteMemory };
};
