FROM docker.io/node:22.17.0-alpine

# Node.js环境配置
ENV HOST=0.0.0.0
ENV PORT=3001

# 安装系统依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 创建非root用户
RUN addgroup --system stock-back-end && \
    adduser --system -G stock-back-end stock-back-end

# 直接复制Nx构建好的产物（由project.json中的build任务生成）
COPY dist/apps/stock-back-end/ ./
# 复制 Prisma schema
COPY prisma ./prisma
# 安装pnpm
RUN npm install -g pnpm@9.15.0

# 安装生产依赖（优化安装过程）
RUN pnpm install --frozen-lockfile

# 生成 Prisma 客户端
RUN pnpm prisma generate

# 修改权限
RUN chown -R stock-back-end:stock-back-end .

# 切换到非root用户
USER stock-back-end

# 启动应用
CMD ["node", "main.js"]
