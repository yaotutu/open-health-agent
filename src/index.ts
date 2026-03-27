/**
 * 健康助手Agent - 公共API导出
 */

// 领域层
export type { 
  HealthDataType, 
  HealthRecord, 
  QueryOptions 
} from './domain/types.js';

// 应用层
export { createHealthAgent } from './application/agent/factory.js';
export { createSessionManager } from './application/session/manager.js';
export { createMessageHandler } from './application/message-handler.js';

// 通道层
export { WebSocketChannelAdapter } from './channels/websocket/adapter.js';
export { createWebSocketChannel } from './channels/websocket/server.js';
export type { ChannelAdapter, MessageHandler } from './channels/interface.js';

// 基础设施
export { createFileStorage } from './infrastructure/storage/file-storage.js';
export type { Storage } from './infrastructure/storage/interface.js';
export { logger } from './infrastructure/logger.js';

// 配置
export { SERVER_CONFIG, LLM_CONFIG, LOG_CONFIG } from './config/index.js';
