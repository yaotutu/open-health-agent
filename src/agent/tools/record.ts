import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Storage, HealthDataType } from '../../storage/index.js';

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

type RecordParams = typeof RecordParamsSchema;

export const createRecordTool = (storage: Storage): AgentTool<RecordParams> => ({
  name: 'record_health_data',
  label: '记录健康数据',
  description: '记录用户的健康数据，如体重、睡眠、饮食、运动、饮水量',
  parameters: RecordParamsSchema,
  execute: async (_toolCallId, params, _signal) => {
    const record = await storage.record({
      type: params.type as HealthDataType,
      value: params.value,
      unit: params.unit,
      note: params.note,
    });

    return {
      content: [{ type: 'text', text: `已记录: ${record.type} ${record.value}${record.unit || ''} (${record.timestamp})` }],
      details: { id: record.id },
    };
  },
});
