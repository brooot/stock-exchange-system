#!/bin/bash

# 简化的开发环境启动脚本

set -e

echo "🚀 启动股票交易系统开发环境..."

# 检查Docker是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker未运行，请先启动Docker"
    exit 1
fi

# 检查环境文件
if [ ! -f ".env.development" ]; then
    echo "❌ 未找到 .env.development 文件"
    echo "💡 提示：请复制 .env.example 为 .env.development 并修改配置"
    exit 1
fi

echo "🏃 启动服务..."
docker compose -f docker-compose.dev.yml up -d

echo "⏳ 等待服务启动..."
sleep 5

# 检查服务状态
echo "📊 服务状态:"
docker compose -f docker-compose.dev.yml ps

echo ""
echo "✅ 开发环境已启动！"
echo "📱 后端服务: http://localhost:3001"
echo "🗄️  数据库: localhost:5432"
echo ""
echo "📝 查看实时日志:"
echo "   docker compose -f docker-compose.dev.yml logs -f stock-back-end-dev"
echo ""
echo "🛑 停止服务:"
echo "   docker compose -f docker-compose.dev.yml down"