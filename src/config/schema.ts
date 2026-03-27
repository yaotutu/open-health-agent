// src/config/schema.ts

/**
 * 配置字段定义
 */
export interface ConfigField {
  /** 值类型 */
  type: 'string' | 'number' | 'boolean';
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 枚举值（仅 string 类型） */
  enum?: string[];
  /** 对应的环境变量名 */
  envVar: string;
}

/**
 * 配置 Schema 结构
 */
export interface ConfigSchema {
  [section: string]: {
    [field: string]: ConfigField;
  };
}

/**
 * 应用配置 Schema
 */
export const configSchema: ConfigSchema = {
  server: {
    port: { type: 'number', default: 3001, envVar: 'PORT' },
    workspacePath: { type: 'string', default: './workspace', envVar: 'WORKSPACE_PATH' },
  },
  llm: {
    provider: { type: 'string', required: true, envVar: 'LLM_PROVIDER' },
    model: { type: 'string', required: true, envVar: 'LLM_MODEL' },
  },
  log: {
    level: {
      type: 'string',
      default: 'debug',
      enum: ['debug', 'info', 'warn', 'error'],
      envVar: 'LOG_LEVEL',
    },
    env: { type: 'string', default: 'development', envVar: 'NODE_ENV' },
  },
};

/**
 * 校验后的配置类型
 */
export interface ValidatedConfig {
  server: {
    port: number;
    workspacePath: string;
  };
  llm: {
    provider: string;
    model: string;
  };
  log: {
    level: 'debug' | 'info' | 'warn' | 'error';
    env: string;
  };
}
