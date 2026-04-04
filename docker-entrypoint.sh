#!/bin/sh
# Docker 入口脚本：启动前自动应用数据库迁移
# 使用 bun:sqlite 执行 drizzle-kit 生成的 SQL 迁移文件

DB_PATH="${DB_PATH:-./data/oha.db}"
MIGRATION_DIR="./drizzle"

# 确保数据目录存在
mkdir -p "$(dirname "$DB_PATH")"

# 应用迁移
bun -e "
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator.js';
const sqlite = new Database('$DB_PATH');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: '$MIGRATION_DIR' });
sqlite.close();
console.log('database migrated');
"

# 启动应用
exec bun run dist/main.js
