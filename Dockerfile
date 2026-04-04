# 阶段1: 构建后端 + 前端
FROM oven/bun:1 AS builder

WORKDIR /app

# 先拷贝依赖声明文件，利用 Docker 缓存加速构建
COPY package.json bun.lock ./
COPY web/package.json ./web/package.json

# 安装依赖
RUN bun install --frozen-lockfile
RUN cd web && bun install --frozen-lockfile

# 拷贝源代码
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/
COPY drizzle.config.ts ./

# 构建后端（tsc 编译到 dist/）和前端（vite 构建到 dist/web/）
RUN bun run build

# 阶段2: 精简运行镜像
FROM oven/bun:1 AS runner

WORKDIR /app

# 拷贝依赖声明并安装生产依赖（better-sqlite3 只在 devDependencies，不需要编译工具）
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# 拷贝构建产物
COPY --from=builder /app/dist ./dist

# 创建数据目录（SQLite 数据库挂载点）
RUN mkdir -p /app/data /app/workspace

# 暴露端口
EXPOSE 3001

# 启动服务
CMD ["bun", "run", "dist/main.js"]
