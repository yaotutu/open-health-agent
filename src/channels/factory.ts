import type { ChannelAdapter } from './types';

/**
 * 表单字段配置
 * 描述渠道绑定表单中的一个输入字段
 */
export interface FieldConfig {
  /** 字段键名，对应凭据 JSON 中的 key */
  key: string;
  /** 显示标签 */
  label: string;
  /** 输入类型：text(明文) | password(密码) */
  type: 'text' | 'password';
  /** 占位提示文字 */
  placeholder?: string;
}

/**
 * 渠道工厂接口
 * 每个渠道类型实现此接口，提供元数据和创建渠道实例的能力
 * 新增渠道只需实现此接口并注册到 registry，前后端都不用改
 */
export interface ChannelFactory {
  /** 渠道类型标识，如 "qq"、"wechat"、"telegram" */
  readonly type: string;
  /** 渠道显示名称 */
  readonly name: string;
  /** 渠道图标（emoji） */
  readonly icon: string;
  /** 是否已启用（未启用的渠道在登录页灰色显示） */
  readonly enabled: boolean;
  /** 绑定表单字段配置 */
  readonly fields: FieldConfig[];
  /** 帮助文档（HTML 格式），指导用户获取凭据 */
  readonly help: string;
  /**
   * 用凭据创建渠道实例
   * 实现时应尝试连接验证凭据有效性，无效时抛出错误
   * @param credentials 凭据键值对，key 对应 fields 中的 key
   * @returns 渠道适配器实例
   */
  create(credentials: Record<string, string>): Promise<ChannelAdapter>;
}
