/**
 * 时间上下文工具
 * 在每条用户消息前注入当前时间，确保 LLM 能精确感知时间
 * 参考设计：nanobot 在每条消息前注入时间，而非仅在系统提示词中
 */

/**
 * 获取当前时间的可读字符串（含星期和时区）
 * @returns 如 "2026-04-02 14:30:00 (星期四) (Asia/Shanghai)"
 */
export function currentTimeStr(): string {
  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const weekday = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' });
  return `${dateStr} (${weekday}) (Asia/Shanghai)`;
}

/**
 * 在消息前注入当前时间上下文
 * 将时间信息以标签形式添加在用户消息之前
 * @param message 原始用户消息
 * @returns 带时间前缀的消息
 */
export function withTimeContext(message: string): string {
  return `[当前时间: ${currentTimeStr()}]\n\n${message}`;
}
