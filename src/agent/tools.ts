import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Store, HealthRecord } from '../store';

const RecordParamsSchema = Type.Object({
  type: Type.Union([
    Type.Literal('weight'),
    Type.Literal('sleep'),
    Type.Literal('diet'),
    Type.Literal('exercise'),
    Type.Literal('water'),
  ], { description: '数据类型' }),
  value: Type.Number({ description: '数值' }),
  unit: Type.Optional(Type.String({ description: '单位，如 kg、小时、杯' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

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

type RecordParams = typeof RecordParamsSchema;
type QueryParams = typeof QueryParamsSchema;

export const createTools = (store: Store) => {
  const record: AgentTool<RecordParams> = {
    name: 'record_health_data',
    label: '记录健康数据',
    description: '记录用户的健康数据，如体重、睡眠、饮食、运动、饮水量',
    parameters: RecordParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.health.record({
        type: params.type as HealthRecord['type'],
        value: params.value,
        unit: params.unit,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录: ${record.type} ${record.value}${record.unit || ''} (${new Date(record.timestamp).toISOString()})` }],
        details: { id: record.id },
      };
    },
  };

  const query: AgentTool<QueryParams> = {
    name: 'query_health_data',
    label: '查询健康数据',
    description: '查询用户的历史健康数据',
    parameters: QueryParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.health.query({
        type: params.type as HealthRecord['type'] | undefined,
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
  };

  return { record, query };
};
