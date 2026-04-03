/**
 * 心跳任务管理的 Agent 工具集
 * 每个用户只有一条心跳记录，通过 add/list/remove 管理其中的任务条目
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { HeartbeatTaskStore } from './store';
import { createSimpleQueryTool } from '../../agent/tool-factory';

// ==================== 工具参数 Schema ====================

/** 添加心跳任务的参数 */
const AddHeartbeatTaskParamsSchema = Type.Object({
  content: Type.String({ description: '心跳任务内容（自然语言描述，如"每天检查睡眠是否充足"）' }),
});

/** 查看心跳任务的参数（无参数） */
const ListHeartbeatTasksParamsSchema = Type.Object({});

/** 删除心跳任务的参数 */
const RemoveHeartbeatTaskParamsSchema = Type.Object({
  lineIndex: Type.Number({ description: '要删除的任务行号（从 1 开始）' }),
});

// ==================== 工具类型 ====================

type AddHeartbeatTaskParams = typeof AddHeartbeatTaskParamsSchema;
type ListHeartbeatTasksParams = typeof ListHeartbeatTasksParamsSchema;
type RemoveHeartbeatTaskParams = typeof RemoveHeartbeatTaskParamsSchema;

// ==================== 工具创建函数 ====================

/**
 * 创建心跳任务相关的 Agent 工具
 * @param store HeartbeatTaskStore 实例
 * @param userId 当前用户 ID
 * @returns 包含 addHeartbeatTask、listHeartbeatTasks、removeHeartbeatTask 的对象
 */
export const createHeartbeatTools = (store: HeartbeatTaskStore, userId: string) => {
  /**
   * 添加心跳任务工具
   * 往用户的心跳记录中追加一条任务
   */
  const addHeartbeatTask: AgentTool<AddHeartbeatTaskParams> = {
    name: 'add_heartbeat_task',
    label: '添加心跳任务',
    description: '添加一个心跳检查任务。心跳系统会定期分析健康数据，根据任务描述决定是否主动关心用户。',
    parameters: AddHeartbeatTaskParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      store.addTask(userId, params.content);
      return {
        content: [{ type: 'text', text: `已添加心跳任务: ${params.content}` }],
        details: { content: params.content },
      };
    },
  };

  /**
   * 查看心跳任务工具
   * 列出当前用户心跳中的所有任务
   */
  const listHeartbeatTasks: AgentTool<ListHeartbeatTasksParams> = {
    name: 'list_heartbeat_tasks',
    label: '查看心跳任务',
    description: '查看当前用户的所有心跳检查任务',
    parameters: ListHeartbeatTasksParamsSchema,
    execute: async (_toolCallId, _params, _signal) => {
      const record = store.get(userId);

      if (!record || !record.content.trim()) {
        return {
          content: [{ type: 'text', text: '当前没有心跳任务' }],
          details: { count: 0 },
        };
      }

      const lines = record.content.split('\n').map(l => l.trim()).filter(Boolean);
      const linesText = lines.map((l, i) => `- [${i + 1}] ${l}`).join('\n');
      const status = record.enabled ? '已启用' : '已禁用';

      return {
        content: [{ type: 'text', text: `心跳状态: ${status}\n${lines.length} 个任务：\n${linesText}` }],
        details: { count: lines.length, enabled: record.enabled },
      };
    },
  };

  /**
   * 删除心跳任务工具
   * 按行号删除指定的任务
   */
  const removeHeartbeatTask: AgentTool<RemoveHeartbeatTaskParams> = {
    name: 'remove_heartbeat_task',
    label: '删除心跳任务',
    description: '删除指定行号的心跳任务（先用 list_heartbeat_tasks 查看行号）',
    parameters: RemoveHeartbeatTaskParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const removed = store.removeTask(userId, params.lineIndex);
      return {
        content: [{ type: 'text', text: removed ? `已删除第 ${params.lineIndex} 条心跳任务` : `未找到第 ${params.lineIndex} 条任务` }],
        details: { removed, lineIndex: params.lineIndex },
      };
    },
  };

  return { addHeartbeatTask, listHeartbeatTasks, removeHeartbeatTask };
};

/**
 * 创建心跳任务极简查询工具（无参数，返回已启用的任务列表）
 * 用于常驻上下文场景，让 LLM 无需传参即可快速获取心跳任务
 */
export const createHeartbeatSimpleQuery = (store: HeartbeatTaskStore, userId: string) =>
  createSimpleQueryTool({
    name: 'list_heartbeat_tasks',
    description: '获取心跳任务列表',
    queryFn: () => Promise.resolve(store.getEnabledTasks(userId)),
  });
