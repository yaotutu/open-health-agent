/**
 * 图表渲染服务
 *
 * 将 Vega-Lite JSON 规范渲染为图片（PNG Buffer 或 base64）。
 * 渲染链路：Vega-Lite spec → vega 编译 → SVG → @resvg/resvg-js 转 PNG。
 * 不依赖 node-canvas，纯 JS + Rust 原生插件，Bun 兼容。
 */
import * as vega from 'vega';
import * as vegaLite from 'vega-lite';
import { Resvg } from '@resvg/resvg-js';
import { createLogger } from '../../infrastructure/logger';

const log = createLogger('chart-render');

/** 渲染选项 */
export interface RenderOptions {
  /** 输出图片宽度（像素），默认 800 */
  width?: number;
  /** 输出图片高度（像素），默认按比例缩放 */
  height?: number;
  /** 图片缩放倍率，默认 2（高清） */
  scale?: number;
}

/**
 * 将 Vega-Lite 规范编译为 SVG 字符串
 *
 * 步骤：
 * 1. vegaLite.compile() 将 Vega-Lite 规范转为 Vega 规范
 * 2. vega.parse() 解析为运行时数据流图
 * 3. vega.View + renderer:'none' 无头渲染为 SVG
 *
 * @param vlSpec Vega-Lite 规范对象
 * @returns SVG 字符串
 */
export async function renderToSVG(vlSpec: Record<string, unknown>): Promise<string> {
  // 编译 Vega-Lite → Vega 规范
  const compileResult = vegaLite.compile(vlSpec as any);
  const vgSpec = compileResult.spec;

  // 创建无头视图，renderer:'none' 不需要 DOM/Canvas
  const runtime = vega.parse(vgSpec as any);
  const view = new vega.View(runtime, {
    renderer: 'none',
    logLevel: vega.Warn,
  });

  try {
    await view.runAsync();
    const svg = await view.toSVG();
    return svg;
  } finally {
    // 释放视图资源，防止内存泄漏
    view.finalize();
  }
}

/**
 * 将 SVG 字符串渲染为 PNG Buffer
 *
 * 使用 @resvg/resvg-js（Rust 原生 SVG 渲染器），比 node-canvas 更快且无系统依赖。
 *
 * @param svgString SVG 字符串
 * @param options 渲染选项
 * @returns PNG Uint8Array
 */
export function svgToPNG(svgString: string, options?: RenderOptions): Uint8Array {
  const scale = options?.scale ?? 2;

  const resvg = new Resvg(svgString, {
    // 优先使用指定尺寸，否则按 scale 缩放
    fitTo: options?.width
      ? { mode: 'width', value: options.width }
      : undefined,
    font: {
      loadSystemFonts: true,
    },
  });

  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * 一站式渲染：Vega-Lite spec → PNG base64
 *
 * Agent 工具直接调用此函数，传入 Vega-Lite 规范，得到可直接发送的 base64 图片。
 *
 * @param vlSpec Vega-Lite 规范对象
 * @param options 渲染选项
 * @returns base64 编码的 PNG 图片和 MIME 类型
 */
export async function renderChart(
  vlSpec: Record<string, unknown>,
  options?: RenderOptions,
): Promise<{ data: string; mimeType: string }> {
  try {
    const svg = await renderToSVG(vlSpec);
    const pngBuffer = svgToPNG(svg, options);
    const base64 = Buffer.from(pngBuffer).toString('base64');

    log.debug('chart rendered svgLen=%d pngLen=%d base64Len=%d',
      svg.length, pngBuffer.length, base64.length);

    return {
      data: base64,
      mimeType: 'image/png',
    };
  } catch (err) {
    log.error('render failed error=%s', (err as Error).message);
    throw err;
  }
}
