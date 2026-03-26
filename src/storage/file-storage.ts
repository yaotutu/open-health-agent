import fs from 'fs/promises';
import path from 'path';
import type { Storage, HealthRecord, QueryOptions } from './index.js';
import { logger } from '../logger/index.js';

// 生成唯一 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// 过滤最近 N 天的记录
const filterByDays = (records: HealthRecord[], days: number) => {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
};

// 过滤指定类型的记录
const filterByType = (records: HealthRecord[], type: string) => {
  return records.filter(r => r.type === type);
};

// 创建文件存储
export const createFileStorage = (dataPath: string): Storage => {
  const filePath = path.join(dataPath, 'records.json');
  logger.debug('[storage] initialized path=%s', filePath);

  // 读取所有记录
  const readAll = async (): Promise<HealthRecord[]> => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  };

  // 写入所有记录
  const writeAll = async (records: HealthRecord[]) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(records, null, 2), 'utf-8');
  };

  // 记录新数据
  const record = async (data: Omit<HealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord> => {
    const records = await readAll();
    const newRecord: HealthRecord = {
      ...data,
      id: generateId(),
      timestamp: new Date().toISOString()
    };
    records.push(newRecord);
    await writeAll(records);
    logger.info('[storage] record type=%s id=%s total=%d', data.type, newRecord.id, records.length);
    return newRecord;
  };

  // 查询数据
  const query = async (options: QueryOptions): Promise<HealthRecord[]> => {
    let records = await readAll();

    if (options.type) {
      records = filterByType(records, options.type);
    }

    if (options.days) {
      records = filterByDays(records, options.days);
    }

    // 按时间倒序
    records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options.limit && options.limit > 0) {
      records = records.slice(0, options.limit);
    }

    logger.debug('[storage] query type=%s days=%d limit=%d results=%d',
      options.type || 'all',
      options.days || 0,
      options.limit || 0,
      records.length
    );

    return records;
  };

  return { record, query };
};
