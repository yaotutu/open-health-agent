/**
 * 集中管理所有环境变量配置
 * 提供统一的配置读取入口，替代各模块直接读取 process.env
 * 所有配置项均提供合理的默认值，便于开发和部署
 */
export const config = {
  /** 服务器监听端口，默认 3001 */
  port: Number(process.env.PORT) || 3001,
  /** SQLite 数据库文件路径，默认 ./data/oha.db */
  dbPath: process.env.DB_PATH || './data/oha.db',
  /** 测试模式：不加载历史消息，不生成对话摘要，默认关闭 */
  testMode: process.env.TEST_MODE === '1',
  /** 优雅关闭超时时间（毫秒），超时后强制退出进程 */
  shutdownTimeout: 10000,

  /** LLM（大语言模型）相关配置 */
  llm: {
    /** LLM 服务提供商，如 anthropic、openai 等 */
    provider: process.env.LLM_PROVIDER || 'anthropic',
    /** LLM 模型名称，决定使用的具体模型版本 */
    model: process.env.LLM_MODEL || 'claude-sonnet-4-6',
  },

  /** QQ Bot SDK 配置（凭据通过登录页绑定，存储在 channel_bindings 表中） */
  qq: {
    /** 会话持久化目录，跨重启可恢复 WebSocket 连接 */
    sessionDir: process.env.QQ_SESSION_DIR || './data/qq-sessions',
    /** 处理消息期间自动发送"正在输入"提示 */
    typingKeepAlive: process.env.QQ_TYPING_KEEP_ALIVE !== '0',
    /** 解析 QQ 表情标签（如 [微笑]）为可读文本 */
    parseFaceEmoji: process.env.QQ_PARSE_FACE_EMOJI !== '0',
  },

  /** 日志相关配置 */
  log: {
    /** 日志级别：debug / info / warn / error，默认 info */
    level: process.env.LOG_LEVEL || 'info',
  },

  /** 心跳相关配置 */
  heartbeat: {
    /** 心跳检查间隔（毫秒），默认 15 分钟 */
    intervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS) || 15 * 60 * 1000,
  },

  /** 会话相关配置 */
  session: {
    /** 惰性摘要触发间隔（毫秒）：用户消息间隔超过此值时生成上一段对话摘要，默认 4 小时 */
    summaryIntervalMs: Number(process.env.SESSION_SUMMARY_INTERVAL_MS) || 4 * 60 * 60 * 1000,
  },

  /** 定时任务相关配置（任务定义存储在 SQLite cron_jobs 表中） */
  cron: {},
};
