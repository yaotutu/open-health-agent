import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream, UserMessage, AssistantMessage } from '@mariozechner/pi-ai';
import type { Store, Message } from '../store';
import { HEALTH_ADVISOR_PROMPT } from './prompt';
import { createTools } from './tools';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';

const convertMessages = (messages: Message[]): Array<UserMessage | AssistantMessage> => {
  const result: Array<UserMessage | AssistantMessage> = [];
  for (const m of messages) {
    if (m.role === 'user') {
      result.push({
        role: 'user',
        content: m.content,
        timestamp: m.timestamp,
      });
    } else {
      result.push({
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: 'anthropic',
        provider: 'anthropic',
        model: LLM_MODEL,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: m.timestamp,
      });
    }
  }
  return result;
};

const createLoggingStreamFn = () => {
  return (model: unknown, context: Context, options?: unknown): AssistantMessageEventStream => {
    console.log('[llm] >>> request', { model });

    const originalStream = streamSimple(model as any, context, options as any);
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
          console.log('[llm] <<< response');
        }
      } catch (err) {
        loggedStream.end();
        console.error('[llm] error:', (err as Error).message);
      }
    })();

    return loggedStream;
  };
};

export interface CreateAgentOptions {
  store: Store;
  messages?: Message[];
}

export const createHealthAgent = (options: CreateAgentOptions) => {
  const { store, messages = [] } = options;

  const agentModel = getModel(LLM_PROVIDER as any, LLM_MODEL);
  const tools = createTools(store);
  const toolList = [tools.record, tools.query];

  console.log(`[agent] created provider=${LLM_PROVIDER} model=${LLM_MODEL} tools=${toolList.length}`);

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
      model: agentModel,
      tools: toolList,
      messages: convertMessages(messages),
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
