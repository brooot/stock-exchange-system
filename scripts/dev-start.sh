#!/bin/bash

# 开发环境快速启动脚本

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
    exit 1
fi

# 启用Docker BuildKit
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "📦 清理旧容器和卷..."
docker-compose -f docker-compose.dev.yml down --remove-orphans

# 可选：清理未使用的镜像和卷（节省空间）
if [ "$1" = "--clean" ]; then
    echo "🧹 清理Docker缓存..."
    docker system prune -f
    docker volume prune -f
fi

echo "🔨 构建开发镜像..."
docker-compose -f docker-compose.dev.yml build --parallel

echo "🏃 启动服务..."
docker-compose -f docker-compose.dev.yml up -d

echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "📊 检查服务状态:"
docker-compose -f docker-compose.dev.yml ps

echo "📝 查看后端日志 (按 Ctrl+C 退出):"
docker-compose -f docker-compose.dev.yml logs -f stock-back-end-dev