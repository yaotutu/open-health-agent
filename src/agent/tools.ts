import type { Store } from '../store';
import { createWaterTools } from '../features/water/tools';
import { createBodyTools } from '../features/body/tools';
import { createSleepTools } from '../features/sleep/tools';
import { createExerciseTools } from '../features/exercise/tools';
import { createObservationTools } from '../features/observation/tools';
import { createSymptomTools } from '../features/symptom/tools';
import { createDietTools } from '../features/diet/tools';
import { createMedicationTools } from '../features/medication/tools';
import { createChronicTools } from '../features/chronic/tools';
import { createMemoryTools } from '../features/memory/tools';
import { createProfileTools } from '../features/profile/tools';
import { createCronTools } from '../cron/tools';
import type { CronService } from '../cron/service';
import { createHeartbeatTools } from '../features/heartbeat/tools';
import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * 创建 Agent 工具集
 * 直接返回扁平的工具数组，每个 feature 模块负责提供自己的工具
 * 新增功能只需在对应 feature 的 tools.ts 中添加，然后在此处注册即可
 * @param store 数据存储实例
 * @param userId 当前用户 ID
 * @param channel 通道名称（用于定时任务推送）
 * @param cronService 可选的定时任务服务实例
 * @returns Agent 工具数组
 */
export const createTools = (
  store: Store,
  userId: string,
  channel: string = 'websocket',
  cronService?: CronService
): AgentTool<any, any>[] => {
  return [
    // 身体数据工具
    ...Object.values(createBodyTools(store.body, userId)),
    // 饮食工具
    ...Object.values(createDietTools(store.diet, userId)),
    // 症状工具
    ...Object.values(createSymptomTools(store.symptom, userId)),
    // 运动工具
    ...Object.values(createExerciseTools(store.exercise, userId)),
    // 睡眠工具
    ...Object.values(createSleepTools(store.sleep, userId)),
    // 饮水工具
    ...Object.values(createWaterTools(store.water, userId)),
    // 用药工具
    ...Object.values(createMedicationTools(store.medication, userId)),
    // 慢性病工具
    ...Object.values(createChronicTools(store.chronic, userId)),
    // 记忆工具
    ...Object.values(createMemoryTools(store.memory, userId)),
    // 健康观察工具
    ...Object.values(createObservationTools(store.observation, userId)),
    // 档案工具
    ...Object.values(createProfileTools(store.profile, userId)),
    // 心跳任务工具
    ...Object.values(createHeartbeatTools(store.heartbeatTask, userId)),
    // 定时任务工具（仅在 cronService 可用时）
    ...(cronService ? Object.values(createCronTools(cronService, userId, channel)) : []),
  ].filter(Boolean);
};
