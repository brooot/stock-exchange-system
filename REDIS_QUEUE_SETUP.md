# Redis 缓存和消息队列集成指南

## 概述

本项目已集成 Redis 缓存和 Bull 消息队列来解决订单处理不及时的问题。通过异步处理订单和缓存机制，大幅提升了系统性能。

## 新增功能

### 1. Redis 缓存服务
- **位置**: `apps/stock-back-end/src/app/redis/`
- **功能**: 
  - 用户余额缓存
  - 用户持仓缓存
  - 订单簿缓存
  - 市场数据缓存
  - 分布式锁机制

### 2. 消息队列系统
- **位置**: `apps/stock-back-end/src/app/queue/`
- **队列类型**:
  - `order-processing`: 订单处理队列
  - `trade-processing`: 交易处理队列
  - `market-data-update`: 市场数据更新队列

### 3. 异步订单处理
- 订单提交后立即返回，后台异步处理
- 市价单具有更高优先级
- 支持队列监控和管理

## 环境配置

### 开发环境 (.env.development)
```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### 生产环境 (.env.production)
```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Docker 部署

### 1. 使用 Docker Compose
```bash
# 启动所有服务（包括 Redis）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看 Redis 日志
docker-compose logs redis
```

### 2. 单独启动 Redis
```bash
# 如果只需要 Redis 服务
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

## API 接口

### 队列监控接口
- `GET /queue/stats` - 获取队列统计信息
- `POST /queue/clean` - 清理队列
- `POST /queue/pause` - 暂停队列
- `POST /queue/resume` - 恢复队列

### 订单接口变化
- 订单提交后立即返回 `PENDING` 状态
- 实际处理结果通过 WebSocket 推送

## 性能优化

### 1. 订单处理优化
- **异步处理**: 订单提交后立即返回，避免阻塞
- **优先级队列**: 市价单优先处理
- **批量处理**: 支持批量订单处理

### 2. 缓存策略
- **用户数据缓存**: 减少数据库查询
- **订单簿缓存**: 提升撮合效率
- **市场数据缓存**: 加速行情推送

### 3. 容错机制
- **重试机制**: 失败任务自动重试
- **死信队列**: 处理失败的任务
- **监控告警**: 队列状态监控

## 监控和维护

### 1. 队列状态监控
```bash
# 查看队列统计
curl -H "Authorization: Bearer <token>" http://localhost:3001/queue/stats
```

### 2. Redis 监控
```bash
# 连接 Redis 客户端
docker exec -it stock-redis redis-cli

# 查看内存使用
INFO memory

# 查看连接数
INFO clients

# 查看键空间
INFO keyspace
```

### 3. 性能调优
- 根据业务量调整队列并发数
- 优化缓存过期时间
- 监控 Redis 内存使用

## 故障排除

### 1. Redis 连接问题
```bash
# 检查 Redis 服务状态
docker-compose logs redis

# 测试 Redis 连接
docker exec -it stock-redis redis-cli ping
```

### 2. 队列处理问题
```bash
# 查看队列状态
curl -H "Authorization: Bearer <token>" http://localhost:3001/queue/stats

# 清理失败的任务
curl -X POST -H "Authorization: Bearer <token>" http://localhost:3001/queue/clean
```

### 3. 性能问题
- 检查队列积压情况
- 监控 Redis 内存使用
- 调整队列并发配置

## 注意事项

1. **生产环境**: 建议为 Redis 设置密码
2. **内存管理**: 定期清理过期缓存
3. **监控告警**: 设置队列积压告警
4. **备份策略**: 配置 Redis 数据持久化
5. **安全性**: 限制 Redis 访问权限

## 下一步优化

1. **集群部署**: Redis 集群和队列集群
2. **监控面板**: 集成 Bull Dashboard
3. **性能分析**: 添加性能指标收集
4. **自动扩缩容**: 根据负载自动调整