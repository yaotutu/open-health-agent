import type { ChannelFactory } from './factory';
import { QqChannelFactory } from './qq-factory';
import { WechatChannelFactory } from './wechat-factory';

/**
 * 渠道注册表
 * 集中管理所有可用的渠道工厂，提供按类型查找的能力
 * 新增渠道时只需在此注册，前后端自动识别
 */
const factories: ChannelFactory[] = [
  new QqChannelFactory(),
  new WechatChannelFactory(),
  // 未来渠道在此添加：
  // new TelegramChannelFactory(),
];

/**
 * 获取所有已注册的渠道工厂
 * 用于前端渲染渠道选项卡和表单
 */
export function getChannelFactories(): ChannelFactory[] {
  return factories;
}

/**
 * 根据渠道类型获取对应的工厂
 * @param type 渠道类型标识，如 "qq"、"wechat"
 * @returns 对应的渠道工厂，不存在则返回 undefined
 */
export function getChannelFactory(type: string): ChannelFactory | undefined {
  return factories.find(f => f.type === type);
}
