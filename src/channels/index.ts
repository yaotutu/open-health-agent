export type { ChannelAdapter, ChannelMessage, ChannelContext, MessageHandler, ClientMessage, ServerMessage, DeliverableChannel } from './types';
export { createMessageHandler, type CreateMessageHandlerOptions } from './handler';
export { WebSocketChannel, createWebSocketChannel, type WebSocketChannelOptions } from './websocket';
export { QQChannel, createQQChannel, type QQChannelOptions } from './qq';
export { WeChatChannel, createWeChatChannel, type WeChatChannelOptions } from './wechat';
export type { ChannelFactory, FieldConfig } from './factory';
export { getChannelFactories, getChannelFactory } from './registry';
export { QqChannelFactory } from './qq-factory';
export { WechatChannelFactory } from './wechat-factory';
