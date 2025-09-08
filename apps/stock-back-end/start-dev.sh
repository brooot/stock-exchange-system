#!/bin/bash
set -e

echo "🚀 启动后端开发服务..."

# 确保依赖安装（处理命名卷导致 /app/node_modules 初次为空的问题）
echo "📦 检查并安装依赖..."
# 切到项目根目录（/app）
cd /app
if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  echo "📦 node_modules 不存在或为空，执行 pnpm install..."
  pnpm install --frozen-lockfile
else
  echo "✅ 依赖已存在，跳过安装"
fi

# 验证关键 LangChain 依赖是否存在
echo "🔍 验证 LangChain 依赖..."
MISSING_DEPS=""
for dep in "@langchain/core" "@langchain/langgraph" "@langchain/openai" "langsmith" "zod"; do
  if [ ! -d "node_modules/$dep" ] && [ ! -L "node_modules/$dep" ]; then
    MISSING_DEPS="$MISSING_DEPS $dep"
  fi
done

if [ -n "$MISSING_DEPS" ]; then
  echo "❌ 缺少关键依赖:$MISSING_DEPS"
  echo "🔧 重新安装依赖..."
  pnpm install --frozen-lockfile
  echo "✅ 依赖重新安装完成"
else
  echo "✅ 所有 LangChain 依赖验证通过"
fi

# 等待数据库连接可用
echo "⏳ 等待数据库连接..."
until pg_isready -h postgres -p 5432 -U postgres; do
  echo "数据库未就绪，等待中..."
  sleep 2
done

echo "✅ 数据库连接成功"

# 检查并执行数据库迁移
echo "🔍 检查数据库迁移状态..."
# 保持在 /app 目录以使用根级 prisma 配置
MIGRATION_STATUS=$(npx prisma migrate status --schema=./prisma/schema.prisma 2>&1 || true)

if echo "$MIGRATION_STATUS" | grep -q "Following migration have not yet been applied"; then
    echo "📦 发现未应用的迁移，正在执行..."
    npx prisma migrate deploy --schema=./prisma/schema.prisma
    echo "✅ 数据库迁移完成"
else
    echo "✅ 数据库迁移已是最新状态"
fi

# 确保 Prisma Client 是最新的
echo "🔄 生成 Prisma Client..."
npx prisma generate --schema=./prisma/schema.prisma

echo "🎯 启动应用程序..."

# 切换到后端应用目录并启动
cd /app/apps/stock-back-end

# 设置开发环境变量
export NODE_ENV=development

# 使用 nodemon 启动应用（开发模式，配置在 nodemon.json 中）
exec dumb-init nodemon
