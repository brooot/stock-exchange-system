# 部署指南

本项目已配置完整的 CI/CD 流程，支持自动化部署到生产环境。

## 🚀 部署架构

- **前端**: Next.js 应用，使用 Nginx 提供静态文件服务
- **后端**: NestJS 应用，提供 API 服务
- **数据库**: PostgreSQL
- **容器化**: Docker + Docker Compose
- **CI/CD**: GitHub Actions

## 📋 服务器环境要求

### 系统要求
- Ubuntu 20.04+ / CentOS 8+ / 其他 Linux 发行版
- 至少 2GB RAM
- 至少 20GB 磁盘空间

### 必需软件
```bash
# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
# Docker Compose 现在已集成到 Docker 中，使用 docker compose 命令
# 如果需要独立安装，可以使用以下命令（但推荐使用集成版本）:
# sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
# sudo chmod +x /usr/local/bin/docker-compose

# 安装 Git
sudo apt update && sudo apt install git -y
```

## ⚙️ 服务器配置

### 1. 克隆项目
```bash
sudo mkdir -p /opt/stock-exchange-system
sudo chown $USER:$USER /opt/stock-exchange-system
cd /opt/stock-exchange-system
git clone https://github.com/your-username/stock-exchange-system.git .
```

### 2. 配置环境变量
```bash
cp .env.example .env.production
vim .env.production
```

配置以下环境变量：
```env
# 数据库配置
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_secure_password
DATABASE_NAME=stock_db
DATABASE_SYNC=false

# 应用配置
NODE_ENV=production
JWT_SECRET=your_jwt_secret_key
API_PORT=3001

# 其他配置
REDIS_URL=redis://localhost:6379
```

### 3. 配置防火墙
```bash
# 开放必要端口
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS (如果使用)
sudo ufw enable
```

## 🔐 GitHub Secrets 配置

在 GitHub 仓库的 Settings > Secrets and variables > Actions 中添加以下 secrets：

| Secret Name | Description | Example |
|-------------|-------------|----------|
| `HOST` | 服务器 IP 地址 | `192.168.1.100` |
| `USERNAME` | 服务器用户名 | `ubuntu` |
| `KEY` | SSH 私钥 | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `PORT` | SSH 端口 (可选) | `22` |
| `PROJECT_PATH` | 项目路径 (可选) | `/opt/stock-exchange-system` |

### SSH 密钥生成
```bash
# 在本地生成 SSH 密钥对
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# 将公钥添加到服务器
ssh-copy-id user@your-server-ip

# 将私钥内容复制到 GitHub Secrets 的 KEY 字段
cat ~/.ssh/id_rsa
```

## 🚀 部署流程

### 自动部署
1. 推送代码到 `main` 分支
2. GitHub Actions 自动触发部署流程
3. 自动构建、测试、部署到生产环境

### 手动部署
```bash
# 在服务器上手动部署
cd /opt/stock-exchange-system
git pull origin main
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

## 🔍 服务监控

### 检查服务状态
```bash
# 查看容器状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f

# 查看特定服务日志
docker compose -f docker-compose.prod.yml logs -f stock-fe
docker compose -f docker-compose.prod.yml logs -f stock-back-end
```

### 健康检查
```bash
# 前端健康检查
curl http://localhost/health

# 后端健康检查
curl http://localhost:3002/api/health
```

## 🛠️ 故障排除

### 常见问题

1. **容器启动失败**
   ```bash
   # 查看详细错误信息
   docker compose -f docker-compose.prod.yml logs
   ```

2. **数据库连接失败**
   - 检查 `.env.production` 中的数据库配置
   - 确保 PostgreSQL 容器正常运行

3. **前端无法访问后端 API**
   - 检查 Nginx 配置中的代理设置
   - 确保后端服务在正确端口运行

4. **部署失败**
   - 检查 GitHub Actions 日志
   - 验证服务器 SSH 连接
   - 确保服务器有足够的磁盘空间

### 回滚操作
```bash
# 回滚到上一个版本
git log --oneline -10  # 查看最近的提交
git checkout <previous-commit-hash>
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

## 📊 性能优化

### Docker 优化
```bash
# 定期清理无用的 Docker 资源
docker system prune -a -f

# 限制日志大小
# 在 docker-compose.prod.yml 中添加:
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Nginx 优化
- 已配置 Gzip 压缩
- 已配置静态文件缓存
- 已配置 API 代理和 WebSocket 支持

## 🔒 安全建议

1. **定期更新系统和 Docker**
2. **使用强密码和 SSH 密钥认证**
3. **配置防火墙规则**
4. **定期备份数据库**
5. **监控系统资源使用情况**

## 📞 支持

如果遇到问题，请：
1. 查看本文档的故障排除部分
2. 检查 GitHub Actions 和服务器日志
3. 在项目仓库中创建 Issue