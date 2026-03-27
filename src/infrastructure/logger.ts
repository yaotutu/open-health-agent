import pino from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'development';

export const logger = pino({
  level: logLevel,
  transport: nodeEnv !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

// 兼容旧代码的默认导出
export default logger;
