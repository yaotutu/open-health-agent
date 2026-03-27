// 纯领域模型，无任何依赖
export type HealthDataType = 'weight' | 'sleep' | 'diet' | 'exercise' | 'water';

export interface HealthRecord {
  id: string;
  type: HealthDataType;
  value: number;
  unit?: string;
  timestamp: string;
  note?: string;
}

export interface QueryOptions {
  type?: HealthDataType;
  days?: number;
  limit?: number;
}
