FROM docker.io/node:22.17.0-alpine

ENV HOST=0.0.0.0
ENV PORT=3001

WORKDIR /app

# 创建非root用户
RUN addgroup --system stock-back-end && \
    adduser --system -G stock-back-end stock-back-end

# 直接复制Nx构建好的产物（由project.json中的build任务生成）
COPY dist/apps/stock-back-end/ ./

# 修改权限
RUN chown -R stock-back-end:stock-back-end .

# 切换到非root用户
USER stock-back-end

# 启动应用
CMD ["node", "main.js"]
