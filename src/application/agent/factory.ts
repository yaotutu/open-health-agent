import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Storage } from '../../infrastructure/storage/interface.js';
import { logger } from '../../infrastructure/logger.js';
import { LLM_CONFIG } from '../../config/index.js';
import { HEALTH_ADVISOR_PROMPT } from './prompt.js';
import { createRecordTool, createQueryTool } from './tools/index.js';

export interface CreateAgentOptions {
  storage: Storage;
  provider?: string;
  model?: string;
}

/**
 * 创建带日志的stream函数
 */
const createLoggingStreamFn = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (model: any, context: Context, options?: any): AssistantMessageEventStream => {
    logger.info({ model, context, options }, '[llm] >>> request');

    const originalStream = streamSimple(model, context, options);
    const loggedStream = createAssistantMessageEventStream();
    let finalMessage: unknown = null;

    (async () => {
      try {
        for await (const event of originalStream) {
          if (event.type === 'done') {
            finalMessage = event.message;
          }
          loggedStream.push(event);
        }
        loggedStream.end();
        if (finalMessage) {
          logger.info({ response: finalMessage }, '[llm] <<< response');
        }
      } catch (err) {
        loggedStream.end();
        logger.error('[llm] error: %s', (err as Error).message);
      }
    })();

    return loggedStream;
  };
};

/**
 * 创建健康顾问Agent
 */
export const createHealthAgent = (options: CreateAgentOptions) => {
  const { storage, provider = LLM_CONFIG.PROVIDER, model = LLM_CONFIG.MODEL } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentModel = getModel(provider as any, model);

  const tools = [
    createRecordTool(storage),
    createQueryTool(storage),
  ];

  logger.info('[agent] created provider=%s model=%s tools=%d', provider, model, tools.length);

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
      model: agentModel,
      tools,
      messages: [],
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
