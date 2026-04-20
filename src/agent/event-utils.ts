import type { AssistantMessage } from '@mariozechner/pi-ai';

/**
 * 从 AssistantMessage 中提取文本内容
 * 遍历消息的 content blocks，拼接所有文本块
 * @param message 助手消息对象（来自 message_end 事件的 event.message）
 * @returns 提取到的文本，无则返回空字符串
 */
export const extractAssistantText = (message: AssistantMessage): string => {
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((block): block is { type: 'text'; text: string } =>
      block.type === 'text' && 'text' in block && typeof block.text === 'string'
    )
    .map(block => block.text)
    .join('');
};

/** 图片内容块（来自工具结果） */
export interface ImageContentBlock {
  type: 'image';
  data: string;
  mimeType: string;
}

/**
 * 从工具执行结果中提取图片内容
 * generate_chart 等工具返回的 AgentToolResult.content 包含 ImageContent
 * @param result 工具执行结果（来自 tool_execution_end 事件的 result）
 * @returns 图片内容数组
 */
export const extractToolImages = (result: { content?: Array<{ type: string; data?: string; mimeType?: string }> }): ImageContentBlock[] => {
  if (!Array.isArray(result?.content)) return [];
  return result.content
    .filter((block): block is ImageContentBlock =>
      block.type === 'image' && typeof block.data === 'string' && typeof block.mimeType === 'string'
    )
    .map(block => ({
      type: 'image' as const,
      data: block.data,
      mimeType: block.mimeType,
    }));
};
