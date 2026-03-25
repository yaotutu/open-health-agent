import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';
import type { Storage } from '../storage/index.js';
import { HEALTH_ADVISOR_PROMPT } from './system-prompt.js';
import { createRecordTool, createQueryTool } from './tools/index.js';

export interface CreateAgentOptions {
  storage: Storage;
  provider?: string;
  model?: string;
}

export const createHealthAgent = (options: CreateAgentOptions) => {
  const { storage, provider = 'anthropic', model } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentModel = getModel(provider as any, model || 'claude-sonnet-4-20250514');

  const tools = [
    createRecordTool(storage),
    createQueryTool(storage),
  ];

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
      model: agentModel,
      tools,
      messages: [],
      thinkingLevel: 'off',
    },
  });

  return agent;
};

export { HEALTH_ADVISOR_PROMPT };
