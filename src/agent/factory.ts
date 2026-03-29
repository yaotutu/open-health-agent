import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream, UserMessage, AssistantMessage } from '@mariozechner/pi-ai';
import type { Store, Message } from '../store';
import { logger } from '../infrastructure/logger';
import { assembleSystemPrompt } from '../prompts/assembler';
import { createTools } from './tools';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';

/**
 * 将存储层消息转换为 Agent 框架所需的消息格式
 * 支持多模态内容：当用户消息包含 metadata 中的图片信息时，
 * 将图片以占位符形式展示（因为只存储了元信息，不含 base64 数据）
 * @param messages 存储层消息列表
 * @returns 转换后的消息列表，供 Agent 框架使用
 */
const convertMessages = (messages: Message[]): Array<UserMessage | AssistantMessage> => {
  const result: Array<UserMessage | AssistantMessage> = [];
  for (const m of messages) {
    if (m.role === 'user') {
      // 默认使用纯文本内容
      let content: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = m.content;
      // 尝试解析 metadata 中的图片信息
      if (m.metadata) {
        try {
          const meta = JSON.parse(m.metadata);
          // 如果 metadata 中包含图片数组，添加图片占位符
          if (meta.images && Array.isArray(meta.images) && meta.images.length > 0) {
            // 只存储了元信息（format, size等），不再包含 base64 data
            // 在 LLM 上下文中以占位符表示
            const imagePlaceholders = meta.images.map((img: { format?: string; mimeType?: string }) =>
              `[图片: ${img.format || img.mimeType || '未知格式'}]`
            ).join(' ');
            content = `${m.content} ${imagePlaceholders}`;
          }
        } catch {
          // metadata 解析失败，使用纯文本
        }
      }
      result.push({
        role: 'user',
        content,
        timestamp: m.timestamp,
      });
    } else {
      result.push({
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: 'anthropic',
        provider: 'anthropic',
        model: LLM_MODEL,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: m.timestamp,
      });
    }
  }
  return result;
};

/**
 * 提取消息中的文本内容（用于日志记录）
 * 支持字符串和数组两种 content 格式
 * @param msg LLM 消息对象
 * @returns 提取的文本内容
 */
const extractTextFromMsg = (msg: any): string => {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
  }
  return '';
};

/**
 * 创建带日志记录的流式函数
 * 记录 LLM 的完整输入（系统提示词 + 消息列表）和输出（模型回复文本）到数据库
 * 方便排查模型行为异常、编码问题等
 */
const createLoggingStreamFn = () => {
  return (model: unknown, context: Context, options?: unknown): AssistantMessageEventStream => {
    // 记录 LLM 输入：系统提示词摘要和完整消息列表
    logger.info(
      { module: 'llm', systemPrompt: context.systemPrompt?.substring(0, 200), messageCount: context.messages.length },
      '[llm] request systemPrompt=%s... messages=%d',
      context.systemPrompt?.substring(0, 50),
      context.messages.length
    );

    // 记录每条输入消息的角色和内容摘要
    for (const msg of context.messages) {
      const text = extractTextFromMsg(msg);
      logger.info(
        { module: 'llm', role: msg.role, content: text },
        '[llm] input role=%s length=%d',
        msg.role,
        text.length
      );
    }

    const originalStream = streamSimple(model as any, context, options as any);
    const loggedStream = createAssistantMessageEventStream();
    let finalMessage: unknown = null;

    (async () => {
      try {
        for await (const event of originalStream) {
          if (event.type === 'done') {
            finalMessage = event.message;
          }
          loggedStream.push(event);
        }
        loggedStream.end();
        if (finalMessage) {
          // 提取输出中的所有文本块和 thinking 块，完整记录
          const output = finalMessage as any;
          const textBlocks = output.content?.filter((b: any) => b.type === 'text') ?? [];
          const thinkingBlocks = output.content?.filter((b: any) => b.type === 'thinking') ?? [];

          for (const block of textBlocks) {
            logger.info(
              { module: 'llm', outputText: block.text },
              '[llm] output text length=%d',
              block.text?.length ?? 0
            );
          }
          for (const block of thinkingBlocks) {
            logger.info(
              { module: 'llm', thinkingText: block.thinking, hasSignature: !!block.thinkingSignature },
              '[llm] output thinking length=%d',
              block.thinking?.length ?? 0
            );
          }

          // 记录 usage 和 stopReason
          logger.info(
            { module: 'llm', usage: output.usage, stopReason: output.stopReason },
            '[llm] response stopReason=%s',
            output.stopReason
          );
        }
      } catch (err) {
        loggedStream.end();
        logger.error({ module: 'llm', error: (err as Error).message }, '[llm] error=%s', (err as Error).message);
      }
    })();

    return loggedStream;
  };
};

export interface CreateAgentOptions {
  store: Store;
  userId: string;
  messages?: Message[];
}

/**
 * 创建健康顾问 Agent 实例
 * 异步函数：需要查询用户档案并注入到系统提示词中
 * 根据用户档案的存在与否，动态生成个性化的系统提示词
 * @param options 创建 Agent 的选项，包含 store、userId 和历史消息
 * @returns 初始化完成的 Agent 实例
 */
export const createHealthAgent = async (options: CreateAgentOptions) => {
  const { store, userId, messages = [] } = options;

  const agentModel = getModel(LLM_PROVIDER as any, LLM_MODEL);
  const tools = createTools(store, userId);
  // 工具列表：包含所有记录、查询、档案、症状解决和记忆工具（共 18 个）
  const toolList = [
    // 记录工具：各类健康数据的录入
    tools.recordBody,
    tools.recordDiet,
    tools.recordSymptom,
    tools.recordExercise,
    tools.recordSleep,
    tools.recordWater,
    // 档案工具：获取和更新用户个人健康档案
    tools.getProfile,
    tools.updateProfile,
    // 查询工具：按时间范围查询各类型历史记录
    tools.queryBodyRecords,
    tools.queryDietRecords,
    tools.querySymptomRecords,
    tools.queryExerciseRecords,
    tools.querySleepRecords,
    tools.queryWaterRecords,
    // 症状解决工具：标记症状为已解决
    tools.resolveSymptom,
    // 记忆工具：长期记忆的存储、查询和删除
    tools.saveMemory,
    tools.queryMemories,
    tools.deleteMemory,
  ];

  // 使用 assembler 动态组装系统提示词
  // 包含静态模板（角色、能力、规则）和动态上下文（档案、最近记录、活跃症状、记忆等）
  const systemPrompt = await assembleSystemPrompt(store, userId);

  logger.info('[agent] created provider=%s model=%s tools=%d', LLM_PROVIDER, LLM_MODEL, toolList.length);

  const agent = new Agent({
    initialState: {
      // 使用动态组装的系统提示词（包含用户档案、最近记录、活跃症状等上下文）
      systemPrompt,
      model: agentModel,
      tools: toolList,
      messages: convertMessages(messages),
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
