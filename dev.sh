#!/bin/bash

# 一键启动开发环境

set -e

echo "🚀 启动开发环境..."

# 检查环境文件
if [ ! -f ".env.development" ]; then
    echo "❌ 未找到 .env.development 文件，请先创建"
    exit 1
fi

# 启动服务
docker compose -f docker-compose.dev.yml up -d

echo "✅ 开发环境已启动！"
echo "📱 后端: http://localhost:3001"
echo "🗄️  数据库: localhost:5432"
echo "📝 查看日志: docker compose -f docker-compose.dev.yml logs -f"