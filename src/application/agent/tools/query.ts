import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Storage } from '../../../infrastructure/storage/interface.js';
import type { HealthDataType } from '../../../domain/types.js';

const QueryParamsSchema = Type.Object({
  type: Type.Optional(Type.Union([
    Type.Literal('weight'),
    Type.Literal('sleep'),
    Type.Literal('diet'),
    Type.Literal('exercise'),
    Type.Literal('water'),
  ], { description: '数据类型，不填则查询所有类型' })),
  days: Type.Optional(Type.Number({ description: '查询最近N天的数据，默认7天' })),
  limit: Type.Optional(Type.Number({ description: '最多返回多少条记录，默认10条' })),
});

type QueryParams = typeof QueryParamsSchema;

export const createQueryTool = (storage: Storage): AgentTool<QueryParams> => ({
  name: 'query_health_data',
  label: '查询健康数据',
  description: '查询用户的历史健康数据',
  parameters: QueryParamsSchema,
  execute: async (_toolCallId, params, _signal) => {
    const records = await storage.query({
      type: params.type as HealthDataType | undefined,
      days: params.days ?? 7,
      limit: params.limit ?? 10,
    });

    if (records.length === 0) {
      return {
        content: [{ type: 'text', text: '没有找到符合条件的健康数据记录。' }],
        details: { count: 0 },
      };
    }

    const lines = records.map(r => {
      const date = new Date(r.timestamp).toLocaleDateString('zh-CN');
      return `- ${date} ${r.type}: ${r.value}${r.unit || ''}${r.note ? ` (${r.note})` : ''}`;
    });

    return {
      content: [{ type: 'text', text: `找到 ${records.length} 条记录:\n${lines.join('\n')}` }],
      details: { count: records.length, records },
    };
  },
});
