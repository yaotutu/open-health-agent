# 通道与 API

## WebSocket

**端点:** `/ws`

```typescript
// 客户端 -> 服务器
{ type: 'prompt', content: '...', sessionId?: string }
{ type: 'continue', sessionId?: string }
{ type: 'abort', sessionId?: string }

// 服务器 -> 客户端
{ type: 'event', event: AgentEvent }
{ type: 'done' }
{ type: 'error', error: string }
```

## QQ Bot

通过 `pure-qqbot` 库实现，自动回复用户消息（不支持流式，累积后发送）。QQ 凭证通过 Web 登录页绑定，存储在 `channel_bindings` 表中，不再使用环境变量。

## 微信

通过 `weixin-ilink` 库实现，使用微信 iLink Bot 协议直接连接微信服务器。用户需在微信中开启 ClawBot 插件（微信 > 我 > 设置 > 插件），这是腾讯逐步灰度开放的官方功能。

### 与 QQ 渠道的差异

| | QQ | 微信 |
|---|---|---|
| 连接方式 | WebSocket 长连接 | HTTP 长轮询 (35s) |
| 认证方式 | appId + appSecret 表单 | QR 扫码登录 |
| 入站消息 | SDK 回调 `onMessage` | 主动轮询 `poll()` |
| 凭据持久化 | 表单凭据永久有效 | Token 失效需重新扫码 |

### QR 扫码绑定流程

微信不支持表单凭据，绑定通过扫码完成：

1. 前端调用 `POST /api/wechat/qrcode` 生成 QR 码
2. 用户用微信扫描 QR 码
3. 前端轮询 `GET /api/wechat/login-status/:loginId` 跟踪状态
4. 登录成功后后端自动完成绑定，返回 userId

### 游标持久化

微信渠道使用 `get_updates_buf` 游标跟踪消息同步位置。服务关闭时游标保存到 `channel_bindings.credentials` JSON 中，重启后恢复，避免重复/遗漏消息。

### 微信专用 API

- `POST /api/wechat/qrcode` — 生成 QR 码，启动扫码登录
- `GET /api/wechat/login-status/:loginId` — 查询扫码登录状态

## 通道注册

通道通过 `ChannelFactory` 接口注册到 `ChannelRegistry`，支持动态添加新通道：
- 每个工厂定义通道类型、配置字段、帮助文本
- `QqChannelFactory` 实现 QQ 通道的注册和创建
- 用户通过 HTTP API（`/api/bind`）绑定通道凭证

## 通道能力声明

通道通过 `ChannelContext.capabilities` 声明自身能力，handler 根据能力决定行为：

- **默认（不声明 capabilities）**: 非流式通道，handler 通过 `send()` 发送完整响应
- **`capabilities: { streaming: true }`**: 流式通道，handler 通过 `sendStream()` 推送增量内容
- handler 始终通过 `context.capabilities?.streaming` 判断，**不依赖 `sendStream` 函数是否存在**

## HTTP API

通过 Hono 提供 REST API 和静态文件服务（定义在 `src/server/routes.ts`）：
- `GET /api/channels` - 获取可用通道列表
- `POST /api/bind` - 绑定用户通道（提交通道凭证）
- `DELETE /api/bind/:userId` - 解绑用户通道
- `GET /api/status/:userId` - 查询用户 Bot 状态
- 静态文件服务：`dist/web/` 目录（Web 前端构建产物）

## Web 前端

Vue 3 + Vite 单页应用（`web/` 目录），提供渠道登录绑定页面：
- 开发时通过 `concurrently` 同时启动 server 和 Vite dev server
- Vite 代理 `/api` 请求到后端 `localhost:3001`
- 构建产物输出到 `dist/web/`，由 Hono 静态文件服务提供
- QQ Bot 使用标准表单绑定（`BindForm` 组件）
- 微信使用 QR 扫码绑定（`WechatQRLogin` 组件），前端根据渠道类型自动切换
