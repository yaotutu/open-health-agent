import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { getChannelFactories } from '../channels/registry';
import type { BotManager } from '../bot/bot-manager';
import { createLogger } from '../infrastructure/logger';

const log = createLogger('api');

/**
 * 创建 API 路由
 * @param botManager Bot 管理器实例
 * @returns Hono 子应用
 */
export function createApiRoutes(botManager: BotManager): Hono {
  const api = new Hono();

  /**
   * GET /api/channels
   * 返回所有可用的渠道列表及其表单配置
   * 前端根据此接口渲染渠道选项卡和动态表单
   */
  api.get('/channels', (c) => {
    const factories = getChannelFactories();
    const channels = factories.map(f => ({
      type: f.type,
      name: f.name,
      icon: f.icon,
      enabled: f.enabled,
      fields: f.enabled ? f.fields : undefined,
      help: f.enabled ? f.help : undefined,
    }));
    return c.json({ channels });
  });

  /**
   * POST /api/bind
   * 用户提交渠道凭据，完成注册和绑定
   * 流程：验证 → 创建绑定 → 启动 Bot → 返回 userId
   */
  api.post('/bind', async (c) => {
    try {
      const body = await c.req.json();
      const { channelType, credentials } = body;

      // 参数校验
      if (!channelType || !credentials) {
        return c.json({ error: '缺少必要参数: channelType, credentials' }, 400);
      }

      // 执行绑定
      const userId = await botManager.bind(channelType, credentials);

      log.info('bind success userId=%s channel=%s', userId, channelType);

      return c.json({ success: true, userId });
    } catch (err) {
      const message = (err as Error).message;
      log.error('bind failed error=%s', message);
      return c.json({ error: message }, 400);
    }
  });

  /**
   * GET /api/status/:userId
   * 查询用户的绑定状态和 Bot 运行状态
   */
  api.get('/status/:userId', async (c) => {
    const userId = c.req.param('userId');
    const bot = botManager.getBot(userId);
    return c.json({
      userId,
      running: !!bot,
    });
  });

  /**
   * DELETE /api/bind/:userId
   * 解绑用户，停止 Bot 实例
   */
  api.delete('/bind/:userId', async (c) => {
    const userId = c.req.param('userId');
    try {
      await botManager.unbind(userId);
      return c.json({ success: true });
    } catch (err) {
      const message = (err as Error).message;
      log.error('unbind failed userId=%s error=%s', userId, message);
      return c.json({ error: message }, 400);
    }
  });

  return api;
}

/**
 * 创建完整的 Hono 应用
 * 包含 API 路由和前端静态文件服务
 * @param botManager Bot 管理器实例
 */
export function createApp(botManager: BotManager): Hono {
  const app = new Hono();

  // API 路由
  app.route('/api', createApiRoutes(botManager));

  // 前端静态文件服务（构建产物）
  app.use('/*', serveStatic({ root: './dist/web' }));

  // SPA fallback：未匹配的路径返回 index.html
  app.get('*', serveStatic({ root: './dist/web', path: 'index.html' }));

  return app;
}
