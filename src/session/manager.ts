import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { Context } from '@mariozechner/pi-ai';
import type { Message } from '../store';
import { config } from '../config';
import { createLogger } from '../infrastructure/logger';

const log = createLogger('session');

/**
 * 使用 LLM 生成对话摘要
 * 提取最近对话的关键内容，压缩为一段简短的摘要
 * @param messages 用户的对话消息列表
 * @returns 生成的对话摘要文本
 */
export async function generateConversationSummary(messages: Message[]): Promise<string> {
  // 取最近20条消息，避免过长输入
  const recent = messages.slice(-20);

  // 构造对话内容文本，将消息列表拼接为可读的对话记录
  const conversationText = recent
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');

  // 获取 LLM 模型实例
  const model = getModel(
    config.llm.provider as any,
    config.llm.model as any
  );

  // 构建 LLM 请求上下文
  const context: Context = {
    systemPrompt: '你是一个对话摘要生成器。请用中文将以下健康顾问对话压缩为2-3句话的摘要，保留关键的健康信息、用户提到的问题和建议。只输出摘要内容，不要其他文字。',
    messages: [{
      role: 'user',
      content: conversationText,
      timestamp: Date.now(),
    }],
  };

  // 使用 streamSimple 获取 LLM 响应
  log.debug('generating summary messages=%d', recent.length);
  const stream = streamSimple(model, context);
  let summary = '';
  for await (const event of stream) {
    if (event.type === 'done' && event.message) {
      summary = event.message.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');
    }
  }
  log.debug('summary generated length=%d', summary.length);
  return summary || '对话摘要生成失败';
}
