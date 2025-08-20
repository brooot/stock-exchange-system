#!/bin/bash

# Redis加载问题修复部署脚本
# 此脚本用于重新部署服务以应用Redis配置修复

echo "🔧 开始部署Redis加载问题修复..."

# 停止现有服务
echo "📦 停止现有服务..."
docker compose -f docker-compose.prod.yml --env-file .env.production  down

# 清理Redis数据（可选，如果数据损坏）
read -p "是否清理Redis数据？这将删除所有缓存数据 (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️ 清理Redis数据..."
    docker volume rm stock-exchange-system_redis-data 2>/dev/null || true
fi

# 重新构建后端服务
echo "🔨 重新构建后端服务..."
docker compose -f docker-compose.prod.yml --env-file .env.production  build stock-back-end

# 启动服务
echo "🚀 启动服务..."
docker compose -f docker-compose.prod.yml --env-file .env.production  up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 检查服务状态
echo "📊 检查服务状态..."
docker compose -f docker-compose.prod.yml --env-file .env.production  ps

# 检查Redis健康状态
echo "🔍 检查Redis健康状态..."
docker compose -f docker-compose.prod.yml --env-file .env.production  exec redis redis-cli ping

# 检查后端服务日志
echo "📋 显示后端服务日志（最近50行）..."
docker compose -f docker-compose.prod.yml --env-file .env.production  logs --tail=50 stock-back-end

echo "✅ 部署完成！"
echo "💡 如果仍有问题，请检查日志：docker compose -f docker-compose.prod.yml --env-file .env.production  logs stock-back-end"
