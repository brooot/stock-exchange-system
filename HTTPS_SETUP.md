# HTTPS 配置说明

## 概述

本项目现在使用 Nginx 反向代理来提供 HTTPS 支持，这是生产环境中推荐的做法。

## 架构

```
用户请求 → Nginx (HTTPS/HTTP) → 前端服务 (HTTP:3000)
                              → 后端服务 (HTTPS:443)
```

## 配置文件

- `nginx/nginx.conf`: Nginx 配置文件
- `docker-compose.prod.yml`: 生产环境 Docker Compose 配置
- `certs/`: SSL 证书目录

## SSL 证书要求

确保在 `certs/` 目录下有以下文件：
- `www.brooot.top.pem`: SSL 证书文件
- `www.brooot.top.key`: SSL 私钥文件

## 端口配置

- **80**: HTTP 端口（自动重定向到 HTTPS）
- **443**: HTTPS 端口
- **3000**: 前端服务内部端口（不直接暴露）
- **3001**: 后端服务内部端口（不直接暴露）

## 启动服务

```bash
# 构建并推送镜像
./scripts/build-and-push.sh

# 启动服务
docker compose -f docker-compose.prod.yml up -d
```

## 访问方式

- **HTTPS**: https://localhost 或 https://your-domain.com
- **HTTP**: http://localhost （自动重定向到 HTTPS）

## 安全特性

- 强制 HTTPS 重定向
- 现代 SSL/TLS 配置
- 安全头设置
- Gzip 压缩
- HTTP/2 支持

## 故障排除

1. **证书问题**: 确保证书文件路径正确且有效
2. **端口冲突**: 确保 80 和 443 端口未被占用
3. **服务依赖**: 确保前端和后端服务正常启动

## 开发环境

开发环境仍然可以使用 Next.js 的内置 HTTPS 支持：

```bash
npm run dev:fe  # 使用 --experimental-https
```