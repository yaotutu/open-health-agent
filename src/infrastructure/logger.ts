import pino from 'pino';
import { LOG_CONFIG } from '../config/index.js';

export const logger = pino({
  level: LOG_CONFIG.LEVEL,
  transport: LOG_CONFIG.ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

// 兼容旧代码的默认导出
export default logger;
