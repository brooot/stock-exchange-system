#!/bin/bash

# 股票交易系统开发环境启动脚本

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

# 禁用Docker BuildKit以避免连接官方Docker Hub的问题
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0

# 解析命令行参数
CLEAN_MODE=false
BUILD_MODE=false
LOGS_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_MODE=true
            shift
            ;;
        --build)
            BUILD_MODE=true
            shift
            ;;
        --logs)
            LOGS_MODE=true
            shift
            ;;
        *)
            echo "未知参数: $1"
            echo "用法: $0 [--clean] [--build] [--logs]"
            echo "  --clean: 清理Docker缓存"
            echo "  --build: 重新构建镜像"
            echo "  --logs:  启动后显示实时日志"
            exit 1
            ;;
    esac
done

echo "📦 清理旧容器和卷..."
docker compose -f docker-compose.dev.yml down --remove-orphans

# 可选：清理未使用的镜像和卷（节省空间）
if [ "$CLEAN_MODE" = true ]; then
    echo "🧹 清理Docker缓存..."
    docker system prune -f
    docker volume prune -f
fi

# 可选：重新构建镜像
if [ "$BUILD_MODE" = true ]; then
    echo "🔨 构建开发镜像..."
    docker compose -f docker-compose.dev.yml build --parallel
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

# 可选：显示实时日志
if [ "$LOGS_MODE" = true ]; then
    echo ""
    echo "📝 查看后端日志 (按 Ctrl+C 退出):"
    docker compose -f docker-compose.dev.yml logs -f stock-back-end-dev
fi
