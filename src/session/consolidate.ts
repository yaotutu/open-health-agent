/**
 * 记忆巩固模块
 *
 * 在会话间隔较长时（复用摘要触发条件），将最近对话和现有记忆一起发给 LLM，
 * 让 LLM 判断是否需要新增、更新或删除记忆。
 * 系统只负责执行 LLM 返回的操作，不做任何业务判断。
 */
import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { Context } from '@mariozechner/pi-ai';
import type { Message } from '../store';
import type { Store } from '../store';
import type { MemoryRecord } from '../store/schema';
import { config } from '../config';
import { createLogger } from '../infrastructure/logger';

const log = createLogger('consolidate');

/**
 * 巩固操作类型
 * LLM 返回的每个操作包含 action 字段和对应的参数
 */
interface ConsolidationAction {
  action: 'add' | 'update' | 'delete';
  content?: string;
  category?: string;
  id?: number;
}

/**
 * 记忆巩固的 LLM 系统提示词
 * 引导 LLM 以 JSON 数组格式返回操作列表
 */
const CONSOLIDATION_PROMPT = `你是一个记忆管理助手。请分析以下对话内容和用户现有记忆，决定需要执行哪些记忆操作。

操作类型：
- add: 对话中发现了值得长期保留的健康相关信息
- update: 已有记忆需要修正、补充或合并（需要指定 id）
- delete: 记忆已过时或不再相关（需要指定 id）

注意：
- 只保留与健康相关的、长期有价值的信息
- 宁可少操作，也不要过度操作
- 如果现有记忆已经充分覆盖对话内容，返回空数组
- content 由你自由组织，用简洁的中文
- 只输出 JSON 数组，不要其他文字`;

/**
 * 从 LLM 响应文本中提取 JSON 数组
 * 兼容 LLM 可能返回 markdown 代码块包裹或带有多余文字的情况
 * @param text LLM 原始响应文本
 * @returns 解析后的操作数组，解析失败返回 null
 */
function parseActions(text: string): ConsolidationAction[] | null {
  // 尝试直接解析
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // 直接解析失败，尝试提取 JSON 数组
  }

  // 用正则提取第一个 JSON 数组
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 提取后仍解析失败
    }
  }

  return null;
}

/**
 * 执行记忆巩固
 * 将最近对话和现有记忆发送给 LLM，解析返回的操作并执行
 *
 * @param store Store 实例，用于读写记忆
 * @param userId 用户 ID
 * @param messages 用户的对话消息列表
 * @param existingMemories 用户当前的所有记忆
 */
export async function consolidateMemories(
  store: Store,
  userId: string,
  messages: Message[],
  existingMemories: MemoryRecord[]
): Promise<void> {
  // 取最近 20 条消息，与摘要生成保持一致
  const recent = messages.slice(-20);

  // 格式化对话内容
  const conversationText = recent
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');

  // 格式化现有记忆为带 ID 的编号列表，供 LLM 引用
  const memoriesText = existingMemories.length > 0
    ? existingMemories
      .map((m, i) => `${i + 1}. [ID:${m.id}, 分类:${m.category || '无'}] ${m.content}`)
      .join('\n')
    : '（无现有记忆）';

  // 构造发送给 LLM 的用户消息
  const userMessage = `## 最近对话\n${conversationText}\n\n## 现有记忆\n${memoriesText}`;

  // 获取 LLM 模型实例
  const model = getModel(
    config.llm.provider as any,
    config.llm.model as any
  );

  // 构造 LLM 请求上下文
  const context: Context = {
    systemPrompt: CONSOLIDATION_PROMPT,
    messages: [{
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    }],
  };

  log.debug('consolidating userId=%s messages=%d memories=%d', userId, recent.length, existingMemories.length);

  // 调用 LLM 获取响应
  const stream = streamSimple(model, context);
  let responseText = '';
  for await (const event of stream) {
    if (event.type === 'done' && event.message) {
      responseText = event.message.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');
    }
  }

  if (!responseText) {
    log.debug('consolidation empty response userId=%s', userId);
    return;
  }

  // 解析 LLM 返回的 JSON 操作
  const actions = parseActions(responseText);
  if (!actions) {
    log.warn('consolidation parse failed userId=%s response=%s', userId, responseText.slice(0, 200));
    return;
  }

  if (actions.length === 0) {
    log.debug('consolidation no ops userId=%s', userId);
    return;
  }

  // 顺序执行操作，单个操作失败不阻塞其余
  let successCount = 0;
  for (const op of actions) {
    try {
      switch (op.action) {
        case 'add':
          if (op.content) {
            await store.memory.save(userId, {
              content: op.content,
              category: op.category,
            });
            successCount++;
            log.debug('consolidation add: %s', op.content.slice(0, 50));
          }
          break;
        case 'update':
          if (op.id && op.content) {
            await store.memory.update(userId, op.id, {
              content: op.content,
              category: op.category,
            });
            successCount++;
            log.debug('consolidation update id=%d', op.id);
          }
          break;
        case 'delete':
          if (op.id) {
            await store.memory.remove(userId, op.id);
            successCount++;
            log.debug('consolidation delete id=%d', op.id);
          }
          break;
        default:
          log.warn('consolidation unknown action=%s', op.action);
      }
    } catch (opErr) {
      log.error('consolidation op failed action=%s error=%s', op.action, (opErr as Error).message);
    }
  }

  log.info('consolidation done userId=%s total=%d success=%d', userId, actions.length, successCount);
}
