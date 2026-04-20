/**
 * 图表生成 Agent 工具
 *
 * LLM 传入完整的 Vega-Lite JSON 规范，工具渲染为 PNG 图片返回。
 * 符合"零硬编码"原则：图表类型、布局、样式全由 LLM 决定。
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { renderChart } from './render';
import { createLogger } from '../../infrastructure/logger';

const log = createLogger('chart-tool');

/** generate_chart 参数 Schema */
const GenerateChartParamsSchema = Type.Object({
  spec: Type.String({
    description: '完整的 Vega-Lite JSON 规范字符串。必须包含 data.values（内联数据）和 mark（图表类型）和 encoding（视觉编码）。',
  }),
  title: Type.Optional(Type.String({
    description: '图表标题，会覆盖 spec 中的 title 字段',
  })),
});

type GenerateChartParams = typeof GenerateChartParamsSchema;

/**
 * 创建图表生成工具
 *
 * 工作流程：
 * 1. LLM 根据用户需求构造 Vega-Lite spec（包含内联数据）
 * 2. 工具解析 spec JSON，设置标题
 * 3. 调用渲染服务生成 PNG 图片
 * 4. 返回 ImageContent（base64），handler 通过通道发送给用户
 *
 * @returns generate_chart 工具
 */
export const createChartTools = (): Record<string, AgentTool> => {
  const generateChart: AgentTool = {
    name: 'generate_chart',
    label: '生成图表',
    description: '将健康数据生成可视化图表。提供完整的 Vega-Lite JSON 规范（含内联数据），返回 PNG 图片。适用于体重趋势、饮食热量、运动统计等场景。',
    parameters: GenerateChartParamsSchema,
    execute: async (_toolCallId, params: any, _signal) => {
      // 1. 解析 JSON spec
      let spec: Record<string, unknown>;
      try {
        spec = JSON.parse(params.spec);
      } catch {
        return {
          content: [{
            type: 'text' as const,
            text: '图表规范 JSON 格式错误，请检查 spec 参数是否为有效的 JSON 字符串。',
          }],
          details: {},
        };
      }

      // 2. 设置标题（工具参数优先于 spec 内的 title）
      if (params.title) {
        spec.title = params.title;
      }

      // 3. 渲染为 PNG 图片
      try {
        const result = await renderChart(spec);

        log.debug('chart generated mimeType=%s dataLen=%d', result.mimeType, result.data.length);

        return {
          content: [
            // 返回图片内容，handler 负责通过通道发送
            { type: 'image' as const, data: result.data, mimeType: result.mimeType },
            // 附带简短文本说明，方便非图片通道降级
            { type: 'text' as const, text: `已生成图表${params.title ? `: ${params.title}` : ''}` },
          ],
          details: { spec, title: params.title },
        };
      } catch (err) {
        log.error('chart render failed error=%s', (err as Error).message);
        return {
          content: [{
            type: 'text' as const,
            text: `图表渲染失败: ${(err as Error).message}。请检查 Vega-Lite 规范是否正确。`,
          }],
          details: {},
        };
      }
    },
  };

  return { generateChart };
};
