/**
 * 领域事件 - 用于未来扩展
 * 当前预留，支持事件驱动架构
 */

export interface DomainEvent {
  type: string;
  payload: unknown;
  timestamp: Date;
}

// 具体事件类型预留
export type HealthEvent = 
  | { type: 'health.recorded'; payload: { recordId: string; type: string } }
  | { type: 'health.queried'; payload: { queryType: string; count: number } };
