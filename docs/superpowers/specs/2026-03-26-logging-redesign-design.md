# 日志系统重构设计

## 背景

当前日志系统过于简陋，无法满足开发调试需求：
- Logger 模块只有 `info`, `error`, `debug` 三个方法
- `debug` 需要设置 `DEBUG` 环境变量才输出
- 关键操作没有日志，无法追踪问题
- 日志输出不一致，没有统一的结构化格式

## 目标

- **所有关键操作都有日志**，无论什么模块
- 开发调试时能看到详细日志
- 支持日志级别控制（debug/info/warn/error）
- 统一的结构化日志格式
- 开发环境自动使用 pretty 格式，生产环境使用 JSON

## 技术选型

**日志库**：pino
- 高性能、低开销
- pino-pretty 提供优秀的开发体验
- 结构化 JSON 日志
- 生态丰富

## 架构设计

```
src/logger/
├── index.ts          # 导出 logger 实例
├── formatters.ts     # 事件格式化工具函数
└── config.ts         # 日志配置
```

## 日志级别控制

通过 `LOG_LEVEL` 环境变量控制：

```bash
LOG_LEVEL=debug bun run dev   # 开发调试（默认）
LOG_LEVEL=info bun run start  # 正常运行
LOG_LEVEL=warn bun run start  # 安静模式
```

## 通用日志规范

### 必须记录的操作类型

| 操作类型 | 说明 | 示例 |
|---------|------|------|
| 生命周期 | 模块/服务的启动、停止、初始化 | 服务启动、连接建立 |
| 外部交互 | 网络、数据库、文件、API 调用 | HTTP 请求、文件读写 |
| 状态变更 | 创建、更新、删除 | 会话创建、配置变更 |
| 错误和异常 | 所有 catch 块、错误处理路径 | 连接失败、解析错误 |

### 日志级别选择

| 级别 | 使用场景 |
|-----|---------|
| debug | 详细调试信息，追踪执行流程 |
| info | 正常业务操作，关键节点 |
| warn | 异常但可恢复的情况 |
| error | 错误，需要关注和处理 |

### 日志格式

```
[模块名] 操作描述 key=value key2=value2
```

**示例：**
```
[server] started port=3001
[ws] client connected ip=127.0.0.1
[storage] record type=血糖 value=120
[agent] event type=message_start role=user
[tool] execute name=record args={"type":"血糖"}
```

## 使用方式

```typescript
import { logger } from './logger';

// 生命周期
logger.info('[server] started port=3001');

// 外部交互
logger.debug('[ws] received type=prompt');

// 状态变更
logger.info('[session] created id=default');

// 错误
logger.error('[storage] error: permission denied');

// 带结构化数据
logger.info({ sessionId: 'default', prompt: '...' }, '[ws] received prompt');
```

## 输出效果

开发环境（自动 pretty）：
```
09:15:32.123 INFO  [server] started port=3001
09:15:32.124 INFO  [ws] client connected ip=127.0.0.1
09:15:32.125 DEBUG [ws] received type=prompt
09:15:32.456 INFO  [storage] record type=血糖 value=120
09:15:33.012 DEBUG [tool] execute name=record
09:15:33.578 INFO  [ws] sent type=done
```

生产环境（JSON）：
```json
{"level":30,"time":1711443332123,"msg":"[server] started port=3001"}
```

## 文件变更

### 新增文件
1. `src/logger/config.ts` - 日志配置（级别、格式）
2. `src/logger/formatters.ts` - 事件格式化工具函数

### 重写文件
3. `src/logger/index.ts` - pino logger 实例

### 修改文件
4. 所有现有模块 - 按规范添加日志
5. `package.json` - 添加 pino 和 pino-pretty 依赖

## 禁止事项

1. 禁止使用 `console.log/info/debug/warn/error`
2. 禁止在日志中输出敏感信息（密码、token、个人数据）

## ESLint 规则（推荐）

```json
{
  "rules": {
    "no-console": "error"
  }
}
```
