#!/bin/bash
set -e

echo "🚀 启动后端开发服务..."

# 等待数据库连接可用
echo "⏳ 等待数据库连接..."
until pg_isready -h postgres -p 5432 -U postgres; do
  echo "数据库未就绪，等待中..."
  sleep 2
done

echo "✅ 数据库连接成功"

# 检查并执行数据库迁移
echo "🔍 检查数据库迁移状态..."
cd /app

# 检查是否有未应用的迁移
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

# 使用 dumb-init 和 nodemon 启动应用
exec dumb-init nodemon \
     --watch src \
     --watch ../../prisma \
     --ignore "**/*.test.ts" \
     --ignore "**/*.spec.ts" \
     --ignore "**/node_modules" \
     --ignore "**/.nx" \
     --delay "3000ms" \
     --exec "cd /app && nx build stock-back-end && node dist/apps/stock-back-end/main.js"