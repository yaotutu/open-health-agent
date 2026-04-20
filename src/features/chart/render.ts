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
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../../infrastructure/logger';

const log = createLogger('chart-render');

/** 捆绑的中文字体文件路径（LXGW NeoXiHei，7MB，SIL 开源协议） */
const FONT_FILE = join(dirname(fileURLToPath(import.meta.url)), 'fonts', 'LXGWNeoXiHei.ttf');

/**
 * 默认 Vega-Lite 配置
 * 设计目标：手机端友好的健康数据图表，清爽、易读、有质感
 */
const DEFAULT_VL_CONFIG = {
  font: 'LXGW NeoXiHei',
  paddingLeft: 50,
  paddingRight: 20,
  paddingTop: 10,
  paddingBottom: 30,
  title: {
    font: 'LXGW NeoXiHei',
    fontSize: 15,
    fontWeight: 'bold',
    anchor: 'start' as const,
    offset: 8,
    color: '#1a1a2e',
  },
  axis: {
    titleFont: 'LXGW NeoXiHei',
    labelFont: 'LXGW NeoXiHei',
    titleFontSize: 12,
    titleColor: '#555',
    labelFontSize: 11,
    labelColor: '#666',
    gridColor: '#f0f0f0',
    gridWidth: 1,
    domain: false,
    tickSize: 0,
    labelPadding: 6,
    titlePadding: 8,
  },
  // Y 轴不强制从 0 开始，让体重/血压等数据的变化更明显
  scale: { zero: false, nice: true },
  legend: {
    titleFont: 'LXGW NeoXiHei',
    labelFont: 'LXGW NeoXiHei',
    labelFontSize: 12,
    symbolSize: 100,
  },
  range: {
    category: ['#4e79a7', '#59a14f', '#f28e2b', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#ff9da7'],
  },
  line: {
    strokeWidth: 2.5,
    // 折线图默认显示数据点
    point: { size: 40, filled: true },
  },
  bar: {
    cornerRadiusTopLeft: 3,
    cornerRadiusTopRight: 3,
  },
  area: {
    fillOpacity: 0.15,
  },
  view: {
    stroke: null,
  },
  background: '#fff',
};

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
 * 1. 注入默认配置（字体、配色等）
 * 2. vegaLite.compile() 将 Vega-Lite 规范转为 Vega 规范
 * 3. vega.parse() 解析为运行时数据流图
 * 4. vega.View + renderer:'none' 无头渲染为 SVG
 */
export async function renderToSVG(vlSpec: Record<string, unknown>): Promise<string> {
  // 合并默认配置：用户 spec 中的 config 优先
  const specWithConfig = {
    ...vlSpec,
    config: {
      ...DEFAULT_VL_CONFIG,
      ...(vlSpec.config as Record<string, unknown> || {}),
    },
  };

  // 编译 Vega-Lite → Vega 规范
  const compileResult = vegaLite.compile(specWithConfig as any);
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
    view.finalize();
  }
}

/**
 * 将 SVG 字符串渲染为 PNG Buffer
 *
 * 使用 @resvg/resvg-js（Rust 原生 SVG 渲染器），比 node-canvas 更快且无系统依赖。
 * 加载捆绑的中文字体文件解决中文乱码问题。
 */
export function svgToPNG(svgString: string, options?: RenderOptions): Uint8Array {
  // 加载捆绑的中文字体（不存在时降级为系统字体）
  const fontFiles: string[] = [];
  if (existsSync(FONT_FILE)) {
    fontFiles.push(FONT_FILE);
    log.debug('loaded bundled font %s', FONT_FILE);
  } else {
    log.warn('bundled font not found: %s, falling back to system fonts', FONT_FILE);
  }

  const resvg = new Resvg(svgString, {
    fitTo: options?.width
      ? { mode: 'width', value: options.width }
      : undefined,
    font: {
      loadSystemFonts: true,
      fontFiles,
    },
  });

  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * 一站式渲染：Vega-Lite spec → PNG base64
 *
 * Agent 工具直接调用此函数，传入 Vega-Lite 规范，得到可直接发送的 base64 图片。
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
