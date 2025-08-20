#!/bin/bash

# Docker 镜像构建和推送脚本
# 用于构建 x86_64 架构的镜像并推送到阿里云镜像仓库

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 加载生产环境变量
if [ -f ".env.production" ]; then
    # 过滤掉注释行、空行和包含特殊字符的行
    set -a  # 自动导出变量
    source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.production)
    set +a  # 关闭自动导出
    echo -e "${GREEN}📋 已加载生产环境变量${NC}"
else
    echo -e "${YELLOW}⚠️  未找到 .env.production 文件，使用默认值${NC}"
fi

# 镜像仓库配置
REGISTRY="crpi-qffyuxj0gnzlj59b.cn-hangzhou.personal.cr.aliyuncs.com"
NAMESPACE="brooot"
REPO_NAME="stock-system"

# 镜像标签
BACKEND_TAG="${REGISTRY}/${NAMESPACE}/${REPO_NAME}:backend-latest"
FRONTEND_TAG="${REGISTRY}/${NAMESPACE}/${REPO_NAME}:frontend-latest"

echo -e "${GREEN}🚀 开始构建应用和 Docker 镜像...${NC}"

# 构建前后端应用
echo -e "${GREEN}📦 构建前后端应用...${NC}"

echo -e "${YELLOW}🔨 构建后端应用...${NC}"
pnpm nx build stock-back-end

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 后端应用构建成功${NC}"
else
    echo -e "${RED}❌ 后端应用构建失败${NC}"
    exit 1
fi

echo -e "${YELLOW}🔨 构建前端应用...${NC}"
pnpm nx build stock-fe

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 前端应用构建成功${NC}"
else
    echo -e "${RED}❌ 前端应用构建失败${NC}"
    exit 1
fi

# 注意：如果未登录 Docker 仓库，推送时会自动提示登录
echo -e "${YELLOW}📋 开始构建 Docker 镜像...${NC}"

# 构建后端镜像
echo -e "${GREEN}🔨 构建后端镜像...${NC}"
docker build --platform linux/amd64 \
  -f apps/stock-back-end/Dockerfile \
  -t "${BACKEND_TAG}" .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 后端镜像构建成功${NC}"
else
    echo -e "${RED}❌ 后端镜像构建失败${NC}"
    exit 1
fi

# 构建前端镜像
echo -e "${GREEN}🔨 构建前端镜像...${NC}"
# 使用环境变量，如果未设置则使用默认值
API_URL=${NEXT_PUBLIC_API_URL:-"https://www.brooot.top"}
WS_URL=${NEXT_PUBLIC_WS_URL:-"wss://www.brooot.top"}
echo -e "${YELLOW}📋 前端配置: API=${API_URL}, WS=${WS_URL}${NC}"
docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_API_URL="${API_URL}" \
  --build-arg NEXT_PUBLIC_WS_URL="${WS_URL}" \
  -f apps/stock-fe/Dockerfile \
  -t "${FRONTEND_TAG}" .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 前端镜像构建成功${NC}"
else
    echo -e "${RED}❌ 前端镜像构建失败${NC}"
    exit 1
fi

# 推送镜像
echo -e "${GREEN}📤 推送镜像到仓库...${NC}"

echo -e "${YELLOW}📤 推送后端镜像...${NC}"
docker push "${BACKEND_TAG}"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 后端镜像推送成功${NC}"
else
    echo -e "${RED}❌ 后端镜像推送失败${NC}"
    exit 1
fi

echo -e "${YELLOW}📤 推送前端镜像...${NC}"
docker push "${FRONTEND_TAG}"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 前端镜像推送成功${NC}"
else
    echo -e "${RED}❌ 前端镜像推送失败${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 所有镜像构建和推送完成！${NC}"
echo -e "${GREEN}📋 镜像信息:${NC}"
echo -e "   后端: ${BACKEND_TAG}"
echo -e "   前端: ${FRONTEND_TAG}"
