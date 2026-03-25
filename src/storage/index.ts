// 健康数据类型
export type HealthDataType = 'weight' | 'sleep' | 'diet' | 'exercise' | 'water';

// 健康记录
export interface HealthRecord {
  id: string;
  type: HealthDataType;
  value: number;
  unit?: string;
  timestamp: string;
  note?: string;
}

// 查询选项
export interface QueryOptions {
  type?: HealthDataType;
  days?: number;
  limit?: number;
}

// 存储接口
export interface Storage {
  record(data: Omit<HealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord>;
  query(options: QueryOptions): Promise<HealthRecord[]>;
}
