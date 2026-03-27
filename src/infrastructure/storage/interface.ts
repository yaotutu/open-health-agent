import type { HealthDataType, HealthRecord, QueryOptions } from '../../domain/types.js';

export type { HealthDataType, HealthRecord, QueryOptions };

export interface Storage {
  record(data: Omit<HealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord>;
  query(options: QueryOptions): Promise<HealthRecord[]>;
  close?(): Promise<void>;
}
