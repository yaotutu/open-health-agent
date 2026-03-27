import { config } from 'dotenv';
import path from 'path';

// 加载环境变量
config();

// 服务器配置
export const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  WORKSPACE_PATH: process.env.WORKSPACE_PATH || './workspace',
  PUBLIC_PATH: path.join(process.cwd(), 'public'),
} as const;

// LLM配置
export const LLM_CONFIG = {
  PROVIDER: process.env.LLM_PROVIDER || 'anthropic',
  MODEL: process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
} as const;

// 日志配置
export const LOG_CONFIG = {
  LEVEL: process.env.LOG_LEVEL || 'debug',
  ENV: process.env.NODE_ENV || 'development',
} as const;

// MIME类型映射（从server/index.ts提取）
export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
} as const;
