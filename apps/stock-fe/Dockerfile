# 多阶段构建 - 构建阶段
FROM node:22.17.0-alpine AS builder

WORKDIR /app

# Node.js环境配置

# 安装pnpm
RUN npm install -g pnpm

# 复制package文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY nx.json tsconfig.base.json ./

# 复制应用配置文件
COPY apps/stock-fe/project.json apps/stock-fe/
COPY apps/stock-fe/tsconfig.json apps/stock-fe/
COPY apps/stock-fe/next.config.js apps/stock-fe/
COPY apps/stock-fe/tailwind.config.js apps/stock-fe/
COPY apps/stock-fe/postcss.config.js apps/stock-fe/

# 安装依赖（只安装必要的依赖）
RUN pnpm install --frozen-lockfile --prefer-offline

# 复制源代码
COPY apps/stock-fe/src apps/stock-fe/src
COPY apps/stock-fe/public apps/stock-fe/public
COPY apps/stock-fe/.swcrc apps/stock-fe/
COPY apps/stock-fe/next-env.d.ts apps/stock-fe/
COPY apps/stock-fe/index.d.ts apps/stock-fe/

# 设置构建时环境变量
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# 构建应用
RUN pnpm nx build stock-fe

# 生产阶段 - 使用Node.js运行Next.js
FROM node:22.17.0-alpine AS runner

WORKDIR /app

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 安装pnpm
RUN npm install -g pnpm

# 复制package文件用于安装运行时依赖
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./

# 只安装生产依赖（优化安装过程）
RUN pnpm install --prod --frozen-lockfile --prefer-offline && \
    pnpm store prune && \
    rm -rf ~/.pnpm-store

# 创建证书目录并复制SSL证书文件
RUN mkdir -p /app/certificates
COPY --chown=nextjs:nodejs certs/ /app/certificates/

# 复制构建产物
COPY --from=builder --chown=nextjs:nodejs /app/dist/apps/stock-fe/.next ./.next
COPY --from=builder /app/dist/apps/stock-fe/public ./public

# 切换到非root用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 启动应用 - 支持HTTPS
CMD ["pnpm", "next", "start"]
