# 日志系统重新设计

## 背景

当前日志存在以下问题：

1. **格式不统一** — 中英混杂（qq.ts 用中文），module 标签命名不一致（`store:symptom` vs `binding`）
2. **数据库 module 列基本为空** — 只有 3 处 LLM 日志用了结构化字段，其余 60+ 条日志的 module 列为 null
3. **噪音太多** — 常规数据读写、消息收发、完整 LLM payload 都记了 info，淹没有价值的信息
4. **重复日志** — cron 执行在 main.ts 和 service.ts 各记一次
5. **关键信息缺失** — 部分错误日志缺少 userId 等上下文
6. **缺乏规则** — 没有明确的"什么记、什么不记"标准，开发者（包括 AI）每次自行判断

## 设计目标

1. 建立明确的日志规则，写入 CLAUDE.md，让 AI 写代码时遵循
2. 引入 createLogger 工厂函数，自动填充 module 列、自动加前缀
3. 减少日志噪音，只记有排查和观察价值的内容
4. 统一格式：英文、一致的 module 命名、一致的 key=value 参数风格

## 核心设计

### 1. createLogger 工厂函数

每个模块通过 `createLogger(moduleName)` 获取子 logger，自动：
- 把 `module` 作为结构化字段传给 Pino（数据库 module 列自动填充）
- 消息文本自动加 `[module]` 前缀（控制台可读）

```typescript
// src/infrastructure/logger.ts 新增
export const createLogger = (module: string) => {
  const child = logger.child({ module });
  return {
    info: (msg: string, ...args: unknown[]) => child.info(`[${module}] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) => child.error(`[${module}] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) => child.warn(`[${module}] ${msg}`, ...args),
    debug: (msg: string, ...args: unknown[]) => child.debug(`[${module}] ${msg}`, ...args),
  };
};
```

使用方式：

```typescript
// 每个模块文件顶部
import { createLogger } from '../infrastructure/logger';
const log = createLogger('handler');

// 使用
log.info('bot started userId=%s channel=%s', userId, channel);
log.error('qq push failed userId=%s error=%s', userId, err.message);
```

控制台输出（pino-pretty）：
```
INFO  [handler] bot started userId=xxx channel=qq
ERROR [handler] qq push failed userId=xxx error=timeout
```

数据库 `module` 列自动填充 `handler`，`msg` 列为 `[handler] bot started userId=xxx channel=qq`。

### 2. 日志规则

#### 必须记（info）— 状态变更

系统发生了"不可逆的事"，你需要知道它发生过：

| 场景 | 例子 |
|------|------|
| 服务启停 | `server started port=3001` |
| 用户/通道绑定变更 | `bot started userId=xxx channel=qq` |
| 定时任务增删 | `cron added id=xxx name=xxx` |
| 心跳触发结果 | `heartbeat checked users=5 alerts=1` |

#### 必须记（error）— 操作失败

| 场景 | 例子 |
|------|------|
| 外部调用失败 | `qq push failed userId=xxx error=xxx` |
| 意料之外的异常 | `shutdown error=xxx` |
| 降级处理 | `fallback send failed userId=xxx error=xxx` |

#### 可选记（debug）— 开发调试

| 场景 | 例子 |
|------|------|
| LLM 调用摘要 | `LLM call model=xxx inputTokens=N outputTokens=N` |
| 内部流程细节 | `session restored userId=xxx` |

#### 不记

| 场景 | 为什么不记 |
|------|-----------|
| 常规数据查询 | 没有状态变更，无排查价值 |
| 常规数据写入（record_* 工具） | 消息历史已有完整记录，日志是重复的 |
| 消息收发（handler processing） | 消息历史已有，日志是重复的 |
| 完整 LLM request/response payload | 数据量大，应该是 debug 级别或按需查看 |

### 3. Module 命名规范

一级结构，不用冒号分隔：

| module 名 | 覆盖文件 |
|-----------|---------|
| `app` | main.ts |
| `agent` | agent/factory.ts |
| `bot` | bot/bot-manager.ts, bot/user-bot.ts |
| `handler` | channels/handler.ts |
| `ws` | channels/websocket.ts |
| `qq` | channels/qq.ts, channels/qq-factory.ts |
| `cron` | cron/service.ts, cron/tools.ts |
| `heartbeat` | heartbeat/scheduler.ts, heartbeat/runner.ts |
| `store` | store/*.ts, features/*/store.ts |

store 层统一用 `store`，不区分子模块。具体操作什么表通过消息内容区分。

### 4. CLAUDE.md 日志规范（替换现有内容）

```markdown
## 日志规范

使用 pino 结构化日志 + `createLogger(module)` 工厂函数。

### 创建 Logger

每个模块文件顶部：
```typescript
import { createLogger } from '../infrastructure/logger';
const log = createLogger('handler');  // module 名见下表
```

### Module 命名

| module | 文件 |
|--------|------|
| app | main.ts |
| agent | agent/factory.ts |
| bot | bot/*.ts |
| handler | channels/handler.ts |
| ws | channels/websocket.ts |
| qq | channels/qq*.ts |
| cron | cron/*.ts |
| heartbeat | heartbeat/*.ts |
| store | store/*.ts, features/*/store.ts |

### 什么记

**info — 状态变更**（发生了不可逆的事，需要知道它发生过）：
- 服务启停：server started/stopped
- 绑定变更：bot started/unbound userId=xxx channel=xxx
- 定时任务增删：cron added/removed id=xxx
- 心跳触发结果：heartbeat checked users=N alerts=N

**error — 操作失败**（失败本身有排查价值）：
- 外部调用失败：qq push failed userId=xxx error=xxx
- 意料之外的异常：shutdown error=xxx
- 降级处理：fallback send failed userId=xxx error=xxx

**debug — 开发调试**（开发时开 debug 可见）：
- LLM 调用摘要：LLM call model=xxx inputTokens=N outputTokens=N
- 内部流程细节

### 什么不记

- **常规数据读写** — record_* 工具的调用、get_recent_* 查询结果。消息历史已有完整记录。
- **消息收发** — handler processing。消息历史已有。
- **完整 LLM payload** — 太大。只记 debug 级别的摘要。
- **store 层的常规操作** — insert/update 成功。出了问题用 error 记。

### 格式

```typescript
// 英文，key=value 参数
log.info('server started port=%d', port);
log.error('push failed userId=%s error=%s', userId, err.message);

// 禁止
console.log                          // 用 log.info/debug/error
log.info('[handler] processing')     // module 前缀自动加，不要手写
log.info('图片下载失败')              // 用英文
```
```

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/infrastructure/logger.ts` | 新增 createLogger 工厂函数 |
| `CLAUDE.md` | 替换日志规范章节 |
| `src/main.ts` | 改用 createLogger，去掉重复 cron 日志，去掉消息收发日志 |
| `src/agent/factory.ts` | 改用 createLogger，LLM 日志降为 debug 摘要 |
| `src/bot/bot-manager.ts` | 改用 createLogger |
| `src/bot/user-bot.ts` | 改用 createLogger，去掉重复的 send 日志 |
| `src/channels/handler.ts` | 改用 createLogger，去掉 processing/send 日志 |
| `src/channels/websocket.ts` | 改用 createLogger |
| `src/channels/qq.ts` | 改用 createLogger，中文改英文 |
| `src/channels/qq-factory.ts` | 改用 createLogger |
| `src/cron/service.ts` | 改用 createLogger |
| `src/heartbeat/scheduler.ts` | 改用 createLogger |
| `src/heartbeat/runner.ts` | 改用 createLogger |
| `src/store/record-store.ts` | 改用 createLogger，去掉常规 insert 日志 |
| `src/store/summary.ts` | 改用 createLogger |
| `src/store/channel-binding-store.ts` | 改用 createLogger |
| `src/features/profile/store.ts` | 改用 createLogger，去掉常规 upsert 日志 |
| `src/features/memory/store.ts` | 改用 createLogger，去掉常规 save/remove 日志 |
| `src/features/symptom/store.ts` | 改用 createLogger，去掉常规 record/resolve 日志 |
| `src/features/chronic/store.ts` | 改用 createLogger，去掉常规 add/update 日志 |
| `src/features/medication/store.ts` | 改用 createLogger，去掉常规 record/stop 日志 |

## 不改的

- 数据库 logs 表 schema
- pino-pretty 格式化
- DbLogWriter 缓冲机制
- store/logs.ts 查询接口（getRecent, getByModule, purge）
