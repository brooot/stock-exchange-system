如何本地调试开发？

1. 使用 docker-compose.dev.yml 文件启动服务端和数据库服务（docker compose -f docker-compose.dev.yml up --build）
2. 使用 nx serve stock-fe 启动 前端

包管理工具： pnpm

注意：
- 启动服务前先看下前端后端的服务是否已经启动，如果已经启动不要重复启动，服务有热更新。前端端口为 3000，后端端口为 3001。如果要重启，记得先关闭之前的端口服务。
