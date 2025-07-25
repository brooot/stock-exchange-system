# Docker 开发环境优化指南

## 🚀 快速启动

使用优化后的启动脚本：

```bash
# 快速启动
./scripts/dev-start.sh

# 清理缓存后启动（首次运行或遇到问题时）
./scripts/dev-start.sh --clean
```

## 📈 性能优化说明

### 1. Docker 构建优化

- **多阶段构建**：分离依赖安装和开发环境
- **BuildKit 缓存**：启用 Docker BuildKit 提高构建速度
- **精确的 .dockerignore**：减少构建上下文大小
- **分层缓存策略**：依赖文件单独缓存层

### 2. 文件挂载优化

- **精确挂载**：只挂载必要的源代码目录
- **命名卷**：使用 Docker 卷存储 node_modules、.nx 缓存等
- **缓存标记**：使用 `:cached` 提高 macOS 性能
- **只读挂载**：配置文件使用 `:ro` 标记

### 3. PostgreSQL 优化

- **性能配置**：自定义 postgres.conf 优化开发环境
- **健康检查优化**：更快的检查间隔
- **资源限制**：合理的内存分配

### 4. Node.js 优化

- **Nodemon 配置**：优化文件监听和重启策略
- **内存设置**：增加 Node.js 堆内存限制
- **进程管理**：使用 dumb-init 作为 PID 1

## 🔧 开发工作流

### 启动服务

```bash
# 启动所有服务
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f stock-back-end-dev

# 查看服务状态
docker-compose -f docker-compose.dev.yml ps
```

### 停止服务

```bash
# 停止服务
docker-compose -f docker-compose.dev.yml down

# 停止并清理卷
docker-compose -f docker-compose.dev.yml down -v
```

### 重建服务

```bash
# 重建后端服务
docker-compose -f docker-compose.dev.yml build stock-back-end-dev

# 重建并启动
docker-compose -f docker-compose.dev.yml up --build -d
```

## 🐛 故障排除

### 常见问题

1. **端口占用**
   ```bash
   # 检查端口占用
   lsof -i :3001
   lsof -i :5432
   ```

2. **缓存问题**
   ```bash
   # 清理 Docker 缓存
   docker system prune -f
   docker volume prune -f
   ```

3. **权限问题**
   ```bash
   # 修复文件权限
   sudo chown -R $(whoami) .
   ```

### 性能监控

```bash
# 查看容器资源使用
docker stats

# 查看容器详细信息
docker-compose -f docker-compose.dev.yml top
```

## 📊 预期性能提升

- **首次启动**：减少 30-50% 的时间
- **重建时间**：减少 60-80% 的时间（得益于缓存）
- **热重载**：响应时间 < 1 秒
- **内存使用**：优化后减少 20-30%

## 🔄 热重载说明

优化后的热重载特性：

- ✅ 源代码修改自动重启
- ✅ Prisma schema 修改自动重新生成
- ✅ 配置文件修改自动重启
- ✅ 忽略测试文件变化
- ✅ 500ms 延迟防止频繁重启

## 🌟 最佳实践

1. **定期清理**：每周运行一次 `docker system prune`
2. **监控资源**：使用 `docker stats` 监控容器性能
3. **版本控制**：不要提交 `.env.development` 文件
4. **备份数据**：重要数据请及时备份