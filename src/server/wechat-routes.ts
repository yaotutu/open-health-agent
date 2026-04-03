import { Hono } from 'hono';
import { loginWithQR } from 'weixin-ilink';
import type { BotManager } from '../bot/bot-manager';
import { createLogger } from '../infrastructure/logger';
const log = createLogger('wechat');

/**
 * 微信 QR 扫码登录的状态
 * 用于在 API 端点之间共享登录进度
 */
interface WechatLoginState {
  /** 当前状态 */
  status: 'waiting' | 'scanned' | 'confirmed' | 'needs_rebind' | 'expired' | 'error';
  /** QR 码图片 URL */
  qrCodeUrl?: string;
  /** 登录成功后的 userId（绑定完成） */
  userId?: string;
  /** 已有的旧绑定 userId（用于提示用户） */
  existingUserId?: string;
  /** 错误信息 */
  error?: string;
  /** QR URL 的 Promise resolve（用于 POST /qrcode 等待 QR 就绪） */
  resolveQR?: (url: string) => void;
  /** QR 登录成功后暂存的凭据，等用户确认后再绑定 */
  pendingCredentials?: Record<string, string>;
}

/**
 * 活跃的 QR 登录会话（内存存储，服务重启后清空）
 */
const loginStates = new Map<string, WechatLoginState>();

/**
 * 创建微信 QR 登录路由
 *
 * 流程：
 * 1. 前端调用 POST /qrcode 生成 QR 码
 * 2. 前端轮询 GET /login-status/:loginId 跟踪状态
 * 3. 用户用微信扫码
 * 4. 如果是新用户 → 自动绑定 → 返回 confirmed
 * 5. 如果已有绑定 → 返回 needs_rebind → 前端弹确认框
 * 6. 用户确认 → 调用 POST /confirm-rebind → 清旧绑新 → 返回 confirmed
 *
 * @param botManager Bot 管理器实例
 * @returns Hono 子应用
 */
export function createWechatRoutes(botManager: BotManager): Hono {
  const router = new Hono();

  /**
   * POST /qrcode
   * 生成微信 QR 码，启动扫码登录流程
   * 后台运行 loginWithQR()，扫码成功后检查是否需要二次确认
   */
  router.post('/qrcode', async (c) => {
    const loginId = `wechat-${Date.now()}`;
    const state: WechatLoginState = { status: 'waiting' };

    // 创建 Promise 等待 QR URL 就绪
    const qrPromise = new Promise<string>((resolve) => {
      state.resolveQR = resolve;
    });

    loginStates.set(loginId, state);

    log.info('QR login session created loginId=%s', loginId);

    // 后台启动 QR 登录流程
    loginWithQR({
      onQRCode: (url) => {
        log.info('QR code generated loginId=%s', loginId);
        state.qrCodeUrl = url;
        state.resolveQR?.(url);
      },
      onStatusChange: (status) => {
        log.info('login status change loginId=%s status=%s', loginId, status);
        if (status === 'scanned') {
          state.status = 'scanned';
        } else if (status === 'refreshing') {
          // QR 过期后自动刷新，状态重置为 waiting
          state.status = 'waiting';
        } else if (status === 'waiting') {
          state.status = 'waiting';
        }
      },
    }).then(async (result) => {
      log.info('login confirmed loginId=%s accountId=%s ilinkUserId=%s', loginId, result.accountId, result.userId);
      try {
        const credentials: Record<string, string> = {
          botToken: result.botToken,
          baseUrl: result.baseUrl,
          accountId: result.accountId,
          ilinkUserId: result.userId || '',
        };

        log.info('attempting bind loginId=%s ilinkUserId=%s', loginId, credentials.ilinkUserId);
        const userId = await botManager.bind('wechat', credentials);

        log.info('bind success loginId=%s userId=%s', loginId, userId);
        state.userId = userId;
        state.status = 'confirmed';
      } catch (err) {
        const errMsg = (err as Error).message;

        if (errMsg === 'WECHAT_REBIND_CONFIRM') {
          // 已有绑定，需要用户二次确认
          // 暂存凭据，等用户通过 /confirm-rebind 确认后再绑定
          log.info('rebind confirmation needed loginId=%s', loginId);
          state.pendingCredentials = {
            botToken: result.botToken,
            baseUrl: result.baseUrl,
            accountId: result.accountId,
            ilinkUserId: result.userId || '',
          };
          state.status = 'needs_rebind';
        } else {
          log.error('bind attempt failed loginId=%s error=%s', loginId, errMsg);
          state.error = errMsg;
          state.status = 'error';
        }
      }
    }).catch((err) => {
      log.error('QR login failed loginId=%s error=%s', loginId, err.message);
      state.error = err.message;
      state.status = 'error';
    });

    // 等待 QR URL 就绪后返回（loginWithQR 会异步生成 QR 码）
    const qrCodeUrl = await qrPromise;

    return c.json({ loginId, qrCodeUrl });
  });

  /**
   * GET /login-status/:loginId
   * 查询 QR 扫码登录状态
   * 前端每 2 秒轮询此接口，直到状态变为 confirmed / needs_rebind / error
   *
   * 状态流转：
   *   waiting → scanned → confirmed（新用户）
   *                       → needs_rebind（已有绑定，等确认）
   *                       → error
   */
  router.get('/login-status/:loginId', async (c) => {
    const loginId = c.req.param('loginId');
    const state = loginStates.get(loginId);

    if (!state) {
      log.warn('login status queried for unknown loginId=%s', loginId);
      return c.json({ error: '登录会话不存在或已过期' }, 404);
    }

    const { status, qrCodeUrl, userId, existingUserId, error } = state;

    // 终态 60 秒后清理，让客户端有时间获取最终状态
    if (status === 'confirmed' || status === 'error') {
      log.info('login session cleanup loginId=%s status=%s userId=%s', loginId, status, userId || '');
      setTimeout(() => loginStates.delete(loginId), 60_000);
    }

    return c.json({ status, qrCodeUrl, userId, existingUserId, error });
  });

  /**
   * POST /confirm-rebind
   * 用户确认重新绑定：清掉旧绑定，用暂存的凭据创建新绑定
   * 前端在用户点击确认按钮后调用此接口
   */
  router.post('/confirm-rebind', async (c) => {
    const { loginId } = await c.req.json();
    const state = loginStates.get(loginId);

    if (!state) {
      log.warn('confirm-rebind: session not found loginId=%s', loginId);
      return c.json({ error: '登录会话不存在或已过期' }, 404);
    }

    if (state.status !== 'needs_rebind') {
      log.warn('confirm-rebind: invalid state loginId=%s status=%s', loginId, state.status);
      return c.json({ error: '当前状态不允许确认重新绑定' }, 400);
    }

    if (!state.pendingCredentials) {
      log.error('confirm-rebind: no pending credentials loginId=%s', loginId);
      return c.json({ error: '缺少登录凭据' }, 400);
    }

    try {
      log.info('confirm-rebind: starting force bind loginId=%s', loginId);
      const userId = await botManager.bindForce(state.pendingCredentials);

      log.info('confirm-rebind: success loginId=%s userId=%s', loginId, userId);
      state.userId = userId;
      state.status = 'confirmed';
      // 清理暂存凭据
      state.pendingCredentials = undefined;

      return c.json({ success: true, userId });
    } catch (err) {
      log.error('confirm-rebind: failed loginId=%s error=%s', loginId, (err as Error).message);
      state.error = (err as Error).message;
      state.status = 'error';
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return router;
}
