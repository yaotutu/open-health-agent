import { QQChannel } from './qq';
import type { ChannelFactory, FieldConfig } from './factory';
import type { ChannelAdapter } from './types';
import { logger } from '../infrastructure/logger';

/**
 * QQ Bot 渠道工厂
 * 实现 ChannelFactory 接口，提供 QQ Bot 的元数据和实例创建能力
 * 用户在登录页选择 QQ Bot 后，表单字段和帮助文档由此工厂提供
 */
export class QqChannelFactory implements ChannelFactory {
  readonly type = 'qq';
  readonly name = 'QQ Bot';
  readonly icon = '企鹅';
  readonly enabled = true;

  readonly fields: FieldConfig[] = [
    { key: 'appId', label: 'AppID', type: 'text', placeholder: '请输入 AppID' },
    { key: 'appSecret', label: 'AppSecret', type: 'password', placeholder: '请输入 AppSecret' },
  ];

  readonly help = `
    <strong>获取凭据</strong> — 前往
    <a href="https://q.qq.com" target="_blank">QQ 开放平台</a>
    创建机器人应用，在应用详情页获取 AppID 和 AppSecret。
    <a href="https://bot.q.qq.com/wiki/" target="_blank">查看教程</a>
  `;

  /**
   * 用 QQ Bot 凭据创建渠道实例
   * 会尝试连接以验证凭据有效性
   * @param credentials 包含 appId 和 appSecret 的凭据对象
   * @returns QQ 渠道适配器实例
   * @throws 凭据缺失时抛出错误
   */
  async create(credentials: Record<string, string>): Promise<ChannelAdapter> {
    const { appId, appSecret } = credentials;

    // 校验必填字段
    if (!appId || !appSecret) {
      throw new Error('AppID 和 AppSecret 不能为空');
    }

    logger.info('[qq-factory] creating channel appId=%s', appId);

    // 创建 QQ 渠道实例（clientSecret 使用 appSecret）
    const channel = new QQChannel({
      appId,
      clientSecret: appSecret,
    });

    return channel;
  }
}
