/**
 * Demo 数据种子脚本
 * 为截图演示生成真实感的健康数据
 *
 * 用法: bun run scripts/seed-demo.ts
 *
 * 会创建一个 demo 用户，并写入 7 天的健康数据
 * 数据设计了一个连贯的故事线：
 *   - 体重从 73.5kg 逐步降到 71.8kg（减脂中）
 *   - 有规律运动但也有偷懒的日子
 *   - 睡眠质量波动（部分天较差，为后续分析做铺垫）
 *   - 饮食有控制也有放纵
 *
 * 用户可以通过这个 demo 账号进行真实对话，
 * Agent 会引用这些历史数据做分析，截图效果真实
 */

import { Database } from 'bun:sqlite';

const DB_PATH = process.env.DB_PATH || './data/oha.db';
const DEMO_USER_ID = process.argv[2] || 'demo:screenshot';

// 时间戳辅助：某天某时（小时, 分钟）→ 毫秒时间戳
function ts(dayOffset: number, hour: number, minute = 0): number {
  // dayOffset=0 表示 4月8日（今天前一天），dayOffset=6 表示 4月2日
  // 4月8日 00:00 CST 的时间戳
  const april8 = 1775664000000; // 2026-04-08 00:00 UTC+8
  const dayMs = (dayOffset - 6) * 86400000; // dayOffset 6 = april 2, dayOffset 0 = april 8
  return april8 - dayMs + hour * 3600000 + minute * 60000;
}

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// 先清除旧的 demo 数据
const tables = [
  'user_profiles', 'body_records', 'diet_records', 'exercise_records',
  'sleep_records', 'water_records', 'symptom_records', 'medication_records',
  'chronic_conditions', 'health_observations', 'messages', 'memories',
  'conversation_summaries', 'heartbeat_tasks', 'cron_jobs'
];

for (const table of tables) {
  try {
    db.exec(`DELETE FROM ${table} WHERE user_id = '${DEMO_USER_ID}'`);
  } catch {}
}

console.log('已清除旧 demo 数据');

// ==================== 用户档案 ====================
db.exec(`
  INSERT INTO user_profiles (user_id, height, age, gender, diseases, allergies, diet_preferences, health_goal, created_at, updated_at)
  VALUES ('${DEMO_USER_ID}', 175, 28, 'male', '[]', '["海鲜"]', '无特殊', '减脂增肌，目标体重 70kg', ${ts(0, 0)}, ${ts(0, 0)})
`);
console.log('✅ 用户档案');

// ==================== 身体数据（8 天，展示下降趋势） ====================
const bodyData: [number, number, number | null][] = [
  // [dayOffset, weight, bodyFat]
  [7, 73.5, 22.1],  // 4/1
  [6, 73.3, null],   // 4/2
  [5, 73.0, 21.8],  // 4/3
  [4, 72.8, null],   // 4/4
  [3, 72.5, 21.5],  // 4/5
  [2, 72.6, null],   // 4/6（反弹一点，更真实）
  [1, 72.2, 21.2],  // 4/7
  [0, 71.8, null],   // 4/8（今天）
];

for (const [day, weight, bodyFat] of bodyData) {
  const bmi = +(weight / (1.75 * 1.75)).toFixed(1);
  db.exec(`
    INSERT INTO body_records (user_id, weight, body_fat, bmi, note, timestamp)
    VALUES ('${DEMO_USER_ID}', ${weight}, ${bodyFat ?? 'NULL'}, ${bmi}, NULL, ${ts(day, 7, 30)})
  `);
}
console.log('✅ 身体数据（8天）');

// ==================== 饮食记录（7 天，每天 2-3 餐） ====================
const dietData = [
  // 4/2 (dayOffset=6) - 相对健康的一天
  { day: 6, h: 8, m: 0, food: '全麦面包两片 + 煎蛋 + 牛奶', cal: 420, protein: 22, carbs: 45, fat: 15, meal: '早餐' },
  { day: 6, h: 12, m: 0, food: '鸡胸肉沙拉', cal: 350, protein: 35, carbs: 20, fat: 12, meal: '午餐' },
  { day: 6, h: 18, m: 30, food: '清炒西兰花 + 红烧鱼 + 米饭一碗', cal: 550, protein: 30, carbs: 60, fat: 18, meal: '晚餐' },

  // 4/3 - 有放纵
  { day: 5, h: 8, m: 30, food: '豆浆 + 油条', cal: 380, protein: 12, carbs: 50, fat: 14, meal: '早餐' },
  { day: 5, h: 12, m: 30, food: '牛肉面', cal: 680, protein: 28, carbs: 85, fat: 22, meal: '午餐' },
  { day: 5, h: 19, m: 0, food: '火锅（羊肉卷、蔬菜、粉丝）', cal: 900, protein: 40, carbs: 60, fat: 45, meal: '晚餐' },

  // 4/4 - 控制饮食
  { day: 4, h: 9, m: 0, food: '燕麦粥 + 香蕉', cal: 280, protein: 8, carbs: 52, fat: 5, meal: '早餐' },
  { day: 4, h: 12, m: 0, food: '糙米饭 + 西红柿炒蛋 + 清炒时蔬', cal: 480, protein: 18, carbs: 65, fat: 14, meal: '午餐' },
  { day: 4, h: 18, m: 30, food: '水煮虾 + 蔬菜沙拉', cal: 320, protein: 28, carbs: 15, fat: 10, meal: '晚餐' },

  // 4/5 - 加班，不太规律
  { day: 3, h: 10, m: 0, food: '面包 + 咖啡', cal: 250, protein: 6, carbs: 40, fat: 8, meal: '早餐' },
  { day: 3, h: 14, m: 30, food: '外卖黄焖鸡米饭', cal: 720, protein: 32, carbs: 80, fat: 28, meal: '午餐' },
  { day: 3, h: 21, m: 0, food: '泡面 + 火腿肠', cal: 520, protein: 15, carbs: 60, fat: 22, meal: '晚餐' },

  // 4/6 - 又开始控制
  { day: 2, h: 8, m: 0, food: '酸奶 + 坚果', cal: 220, protein: 10, carbs: 20, fat: 12, meal: '早餐' },
  { day: 2, h: 12, m: 30, food: '鸡肉卷饼', cal: 450, protein: 28, carbs: 40, fat: 16, meal: '午餐' },
  { day: 2, h: 19, m: 0, food: '蒸鱼 + 糙米饭半碗 + 炒青菜', cal: 420, protein: 32, carbs: 35, fat: 12, meal: '晚餐' },

  // 4/7 - 比较健康
  { day: 1, h: 7, m: 30, food: '鸡蛋两个 + 全麦吐司 + 牛奶', cal: 380, protein: 24, carbs: 35, fat: 14, meal: '早餐' },
  { day: 1, h: 12, m: 0, food: '减脂便当（鸡胸肉、糙米、西兰花）', cal: 480, protein: 38, carbs: 42, fat: 12, meal: '午餐' },
  { day: 1, h: 18, m: 30, food: '西红柿蛋花汤 + 杂粮馒头', cal: 300, protein: 12, carbs: 48, fat: 6, meal: '晚餐' },

  // 4/8 - 今天，还没吃完
  { day: 0, h: 8, m: 0, food: '包子两个 + 豆浆', cal: 350, protein: 14, carbs: 48, fat: 10, meal: '早餐' },
  { day: 0, h: 12, m: 30, food: '排骨饭', cal: 650, protein: 25, carbs: 75, fat: 22, meal: '午餐' },
];

for (const d of dietData) {
  db.exec(`
    INSERT INTO diet_records (user_id, food, calories, protein, carbs, fat, sodium, meal_type, note, timestamp)
    VALUES ('${DEMO_USER_ID}', '${d.food}', ${d.cal}, ${d.protein}, ${d.carbs}, ${d.fat}, NULL, '${d.meal}', NULL, ${ts(d.day, d.h, d.m)})
  `);
}
console.log('✅ 饮食记录（7天，22条）');

// ==================== 运动记录（展示有规律但不完美） ====================
const exerciseData = [
  // 4/2 - 跑步
  { day: 6, type: '跑步', duration: 35, cal: 320, hrAvg: 145, hrMax: 168, dist: 5.0, note: null },
  // 4/3 - 休息（火锅日）
  // 4/4 - 力量训练
  { day: 4, type: '力量训练', duration: 50, cal: 280, hrAvg: 120, hrMax: 150, dist: null, note: '胸+三头' },
  // 4/5 - 加班没运动
  // 4/6 - 跑步
  { day: 2, type: '跑步', duration: 40, cal: 360, hrAvg: 142, hrMax: 165, dist: 5.5, note: null },
  // 4/7 - 跑步
  { day: 1, type: '跑步', duration: 32, cal: 300, hrAvg: 148, hrMax: 172, dist: 5.0, note: '配速有进步' },
  // 4/8 - 今天还没运动
];

for (const e of exerciseData) {
  db.exec(`
    INSERT INTO exercise_records (user_id, type, duration, calories, heart_rate_avg, heart_rate_max, distance, note, timestamp)
    VALUES ('${DEMO_USER_ID}', '${e.type}', ${e.duration}, ${e.cal}, ${e.hrAvg}, ${e.hrMax}, ${e.dist ?? 'NULL'}, ${e.note ? `'${e.note}'` : 'NULL'}, ${ts(e.day, 19, 0)})
  `);
}
console.log('✅ 运动记录（4次）');

// ==================== 睡眠记录（展示波动，为分析做铺垫） ====================
const sleepData = [
  // [dayOffset, 时长分钟, 质量1-5, 入睡时, 起床时, 深睡分钟, note]
  // dayOffset 是"醒来那天"
  // 4/2 - 还行
  [6, 420, 3, ts(7, 0, 0), ts(6, 7, 0), 60, null],
  // 4/3 - 火锅吃太饱，睡得不好
  [5, 360, 2, ts(6, 1, 30), ts(5, 7, 30), 35, '吃太饱，翻来覆去'],
  // 4/4 - 不错
  [4, 450, 4, ts(7, 22, 30), ts(6, 6, 0), 75, null],
  // 4/5 - 加班熬夜
  [3, 300, 1, ts(6, 2, 0), ts(5, 7, 0), 25, '加班到1点多才睡'],
  // 4/6 - 补觉
  [2, 540, 4, ts(7, 0, 0), ts(6, 9, 0), 90, '周末补觉'],
  // 4/7 - 正常
  [1, 450, 3, ts(7, 23, 0), ts(6, 6, 30), 70, null],
  // 4/8 - 今天
  [0, 390, 2, ts(7, 1, 0), ts(6, 6, 30), 40, '有点失眠'],
];

for (const s of sleepData) {
  db.exec(`
    INSERT INTO sleep_records (user_id, duration, quality, bed_time, wake_time, deep_sleep, note, timestamp)
    VALUES ('${DEMO_USER_ID}', ${s[1]}, ${s[2]}, ${s[3]}, ${s[4]}, ${s[5]}, ${s[6] ? `'${s[6]}'` : 'NULL'}, ${s[4]})
  `);
}
console.log('✅ 睡眠记录（7天）');

// ==================== 饮水记录（散落的） ====================
const waterData = [
  // 4/5 加班那天喝水少
  [3, 800, '只喝了三杯水'],
  // 4/7 运动日喝水多
  [1, 2200, '运动后补水'],
  // 4/8 今天
  [0, 1000, null],
];

for (const [day, amount, note] of waterData) {
  db.exec(`
    INSERT INTO water_records (user_id, amount, note, timestamp)
    VALUES ('${DEMO_USER_ID}', ${amount}, ${note ? `'${note}'` : 'NULL'}, ${ts(day as number, 20, 0)})
  `);
}
console.log('✅ 饮水记录');

// ==================== 症状记录（关联睡眠不好） ====================
db.exec(`
  INSERT INTO symptom_records (user_id, description, severity, body_part, related_type, related_id, resolved_at, note, timestamp)
  VALUES ('${DEMO_USER_ID}', '头痛，太阳穴胀', 4, '头部', NULL, NULL, ${ts(4, 10, 0)}, '熬夜之后容易这样', ${ts(3, 8, 0)})
`);
db.exec(`
  INSERT INTO symptom_records (user_id, description, severity, body_part, related_type, related_id, resolved_at, note, timestamp)
  VALUES ('${DEMO_USER_ID}', '眼睛干涩', 3, '眼睛', NULL, NULL, NULL, '最近看屏幕时间长', ${ts(0, 9, 0)})
`);
console.log('✅ 症状记录（2条）');

// ==================== 慢性病 ====================
db.exec(`
  INSERT INTO chronic_conditions (user_id, condition, severity, seasonal_pattern, triggers, notes, is_active, created_at, updated_at)
  VALUES ('${DEMO_USER_ID}', '过敏性鼻炎', '轻度', '春秋季加重', '["花粉","灰尘"]', '每年4-5月比较明显', 1, ${ts(6, 0, 0)}, ${ts(6, 0, 0)})
`);
console.log('✅ 慢性病记录');

// ==================== 一些记忆 ====================
const memories = [
  { content: '用户每周跑3-4次步，配速约6分/km', category: 'exercise' },
  { content: '用户对海鲜过敏', category: 'allergy' },
  { content: '用户工作日经常加班到很晚', category: 'lifestyle' },
  { content: '用户目标体重70kg，目前约72kg', category: 'goal' },
];

for (const m of memories) {
  db.exec(`
    INSERT INTO memories (user_id, content, category, created_at)
    VALUES ('${DEMO_USER_ID}', '${m.content}', '${m.category}', ${ts(3, 0, 0)})
  `);
}
console.log('✅ 记忆（4条）');

// ==================== 历史消息（让对话有上下文感） ====================
const messageHistory = [
  // 4/2
  { role: 'user', content: '今天跑了5公里，35分钟，感觉还行', ts: ts(6, 19, 30) },
  { role: 'assistant', content: '记录好了！5公里35分钟，配速7分/km，不错的有氧训练。跑完步记得拉伸和补水。', ts: ts(6, 19, 31) },

  // 4/3
  { role: 'user', content: '晚上吃了火锅，有点罪恶感', ts: ts(5, 21, 0) },
  { role: 'assistant', content: '火锅偶尔吃一次没关系的，关键是总体摄入控制。今天热量确实偏高一些，但明天恢复正常饮食就好。建议明天做点有氧运动消耗一下。', ts: ts(5, 21, 1) },

  // 4/5
  { role: 'user', content: '今天加班到好晚，头痛', ts: ts(3, 22, 0) },
  { role: 'assistant', content: '加班辛苦了。头痛可能和熬夜、用眼过度有关。今天早点休息，明天看看症状是否缓解。如果经常出现要注意调整作息。', ts: ts(3, 22, 1) },

  // 4/7
  { role: 'user', content: '今天跑步了，32分钟5公里，感觉比上次轻松', ts: ts(1, 20, 0) },
  { role: 'assistant', content: '进步很明显！上次是35分钟，这次32分钟，配速从7分提升到6分24秒，说明心肺功能在改善。继续坚持，离你的目标越来越近了。', ts: ts(1, 20, 1) },
];

for (const msg of messageHistory) {
  db.exec(`
    INSERT INTO messages (user_id, role, content, metadata, timestamp)
    VALUES ('${DEMO_USER_ID}', '${msg.role}', '${msg.content.replace(/'/g, "''")}', NULL, ${msg.ts})
  `);
}
console.log('✅ 历史消息（8条）');

// ==================== 心跳任务 ====================
db.exec(`
  INSERT INTO heartbeat_tasks (user_id, content, enabled, created_at, updated_at)
  VALUES ('${DEMO_USER_ID}', '提醒用户按时吃饭
关注用户睡眠质量
如果用户连续2天没有运动记录，温和提醒', 1, ${ts(6, 0, 0)}, ${ts(6, 0, 0)})
`);
console.log('✅ 心跳任务');

db.close();

console.log('\n🎉 Demo 数据注入完成！');
console.log(`\n用户ID: ${DEMO_USER_ID}`);
console.log('数据范围: 2026-04-02 ~ 2026-04-08（7天）');
console.log('\n数据概况:');
console.log('  - 体重: 73.5kg → 71.8kg（下降趋势）');
console.log('  - 运动: 4次（3次跑步 + 1次力量训练）');
console.log('  - 睡眠: 波动较大（4/5加班熬夜最差，4/6补觉最好）');
console.log('  - 饮食: 有控制也有放纵（4/3火锅、4/5加班吃泡面）');
console.log('  - 症状: 加班后头痛、眼睛干涩');
console.log('  - 慢性病: 过敏性鼻炎（春季发作期）');
console.log('\n下一步: 用这个账号登录，进行对话，然后截图');
