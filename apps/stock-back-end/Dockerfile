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

# 安装pnpm
RUN npm install -g pnpm@10.14.0

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装生产依赖（优化安装过程）
RUN pnpm install --prod --frozen-lockfile

# 清理可能存在的编译缓存
RUN rm -rf node_modules/.cache

# 验证bcryptjs模块是否正确安装
RUN node -e "console.log('bcryptjs test:', require('bcryptjs').hashSync('test', 10))"

# 直接复制Nx构建好的产物（由project.json中的build任务生成）
COPY dist/apps/stock-back-end/ ./
# 复制 Prisma schema
COPY prisma ./prisma

# 同步复制 AI 资产到运行时代码使用的固定路径，保证与开发一致
RUN mkdir -p /app/apps/stock-back-end/src/app/ai/assets
COPY apps/stock-back-end/src/app/ai/assets/brooot_profile.pdf /app/apps/stock-back-end/src/app/ai/assets/

# 生成 Prisma 客户端
RUN pnpm prisma generate

# 修改权限
RUN chown -R stock-back-end:stock-back-end .

# 切换到非root用户
USER stock-back-end

# 启动应用
CMD ["node", "main.js"]
