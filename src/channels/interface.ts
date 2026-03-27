/**
 * 通道接口定义
 * 所有具体通道（WebSocket, Telegram等）都必须实现此接口
 */

import type { ChannelMessage, ChannelResponse, ChannelStreamChunk } from '../infrastructure/message-bus/types.js';

/**
 * 通道适配器接口
 * 实现此接口即可添加新通道（Telegram, 飞书, QQ Bot等）
 */
export interface ChannelAdapter {
  /** 通道名称 */
  readonly name: string;
  
  /** 启动通道 */
  start(): Promise<void>;
  
  /** 停止通道 */
  stop(): Promise<void>;
  
  /**
   * 设置消息处理器
   * 当通道收到消息时，调用此处理器
   */
  onMessage(handler: MessageHandler): void;
  
  /**
   * 发送响应给用户
   * @param response 响应内容
   * @param context 通道特定的上下文（如WebSocket连接、Telegram chatId等）
   */
  send(response: ChannelResponse, context: unknown): Promise<void>;
  
  /**
   * 发送流式响应块
   * 用于打字机效果的流式输出
   */
  sendStream?(chunk: ChannelStreamChunk, context: unknown): Promise<void>;
}

/**
 * 消息处理器类型
 */
export type MessageHandler = (message: ChannelMessage) => Promise<ChannelResponse>;

/**
 * 通道配置基础接口
 */
export interface ChannelConfig {
  enabled: boolean;
  [key: string]: unknown;
}
