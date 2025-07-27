# 环境配置说明

## 环境变量文件

本项目使用不同的环境变量文件来管理开发和生产环境的配置：

### 文件说明

- `.env.example` - 环境变量模板文件，包含所有必需的配置项
- `.env.development` - 开发环境配置（不提交到版本控制）
- `.env.production` - 生产环境配置模板（不提交到版本控制）

### 数据库连接配置

#### 开发环境

**本地开发**（直接运行 Node.js）：
```
DATABASE_URL="postgresql://postgres:1123@localhost:5432/stock_db?schema=public"
```

**容器开发**（使用 docker-compose.dev.yml）：
```
DATABASE_URL="postgresql://postgres:1123@postgres:5432/stock_db?schema=public"
```

#### 生产环境

**容器生产**（使用 docker-compose.yml）：
```
DATABASE_URL="postgresql://postgres:your_password@postgres:5432/stock_db?schema=public"
```

### 环境文件自动选择

应用程序会根据 `NODE_ENV` 环境变量自动选择对应的环境文件：
- 开发环境（`NODE_ENV=development` 或未设置）：使用 `.env.development`
- 生产环境（`NODE_ENV=production`）：使用 `.env.production`

### 设置步骤

1. **初始设置**：
   ```bash
   # 创建开发环境配置
   cp .env.example .env.development
   
   # 创建生产环境配置
   cp .env.example .env.production
   ```

2. **编辑对应的环境文件**，填入实际的数据库密码和其他配置

3. **开发环境启动**：
   ```bash
   # 使用 Docker 开发环境
   docker compose -f docker-compose.dev.yml up -d
   
   # 或本地开发（需要本地 PostgreSQL）
   pnpm install
   pnpm nx serve stock-back-end
   ```

4. **生产环境部署**：
   ```bash
   # 复制并配置生产环境变量
   cp .env.example .env.production
   # 编辑 .env.production 文件，设置生产环境的安全密码
   
   # 启动生产环境
   docker compose -f docker-compose.prod.yml up -d
   ```

### 重要注意事项

1. **数据库主机名**：
   - 本地开发：使用 `localhost`
   - Docker 容器：使用 `postgres`（服务名）

2. **数据库同步**：
   - 开发环境：`DATABASE_SYNC=true`
   - 生产环境：`DATABASE_SYNC=false`（必须）

3. **安全性**：
   - 生产环境必须使用强密码
   - 不要将包含敏感信息的环境变量文件（`.env.development`、`.env.production` 等）提交到版本控制
   - 考虑使用密钥管理服务

4. **Prisma 迁移**：
   ```bash
   # 开发环境
   npx prisma migrate dev
   
   # 生产环境
   npx prisma migrate deploy
   ```

### 故障排除

如果遇到数据库连接问题：

1. 检查 `DATABASE_URL` 中的主机名是否正确
2. 确认数据库服务是否已启动
3. 验证用户名和密码是否正确
4. 检查网络连接（Docker 网络配置）