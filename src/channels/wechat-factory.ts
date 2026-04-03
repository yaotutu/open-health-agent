import { WeChatChannel } from './wechat';
import type { ChannelFactory, FieldConfig } from './factory';
import type { ChannelAdapter } from './types';

/**
 * 微信渠道工厂
 * 实现 ChannelFactory 接口，提供微信渠道的元数据和实例创建能力
 *
 * 微信使用 QR 扫码登录，不需要用户填写表单凭据
 * 前端根据 channel type 渲染 QR 登录组件，而非标准表单
 * QR 登录成功后，凭据通过专用 API 传入 bind 流程
 */
export class WechatChannelFactory implements ChannelFactory {
  readonly type = 'wechat';
  readonly name = '微信';
  readonly icon = '💬';
  readonly enabled = true;

  /** 无表单字段 — 微信使用 QR 扫码绑定，不走标准表单流程 */
  readonly fields: FieldConfig[] = [];

  readonly help = `
    <strong>扫码绑定</strong> — 点击下方按钮生成二维码，
    使用微信扫描即可完成绑定。
    <br/><br/>
    <strong>前提条件</strong>：需要微信已开启
    <strong>ClawBot 插件</strong>
    （微信 &gt; 我 &gt; 设置 &gt; 插件）。
    该功能由腾讯逐步灰度开放，如未看到该插件请耐心等待。
  `;

  /**
   * 用微信登录凭据创建渠道实例
   * 凭据来自 QR 扫码登录流程，通过 wechat-routes 传入 bind
   * @param credentials 包含 botToken、baseUrl、accountId 的凭据对象
   * @returns 微信渠道适配器实例
   * @throws 凭据缺失时抛出错误
   */
  async create(credentials: Record<string, string>): Promise<ChannelAdapter> {
    const { botToken, baseUrl } = credentials;

    if (!botToken || !baseUrl) {
      throw new Error('缺少微信登录凭据（botToken、baseUrl）');
    }

    return new WeChatChannel({
      botToken,
      baseUrl,
      accountId: credentials.accountId,
      cursor: credentials.cursor,
    });
  }
}
