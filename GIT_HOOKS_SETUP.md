# Git 钩子设置指南

## 自动同步 .env.production 文件到服务器

本项目已配置了一个 Git post-push 钩子，可以在每次 push 代码后自动将 `.env.production` 文件同步到生产服务器。

### 钩子功能

- **触发时机**: 每次执行 `git push` 后
- **功能**: 自动将本地的 `.env.production` 文件传输到服务器
- **额外操作**: 可选择重启服务器上的 Docker 服务

### 配置要求

#### 1. SSH 密钥配置

确保你的本地机器可以通过 SSH 密钥无密码登录到服务器：

```bash
# 生成 SSH 密钥（如果还没有）
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# 将公钥复制到服务器
ssh-copy-id root@SERVER_HOST

# 测试连接
ssh root@SERVER_HOST
```

#### 2. 服务器配置

钩子脚本中的默认配置：
- **服务器地址**: `SERVER_HOST`
- **用户名**: `root`
- **项目路径**: `/root/projects/stock-exchange-system`

如需修改，请编辑 `.git/hooks/pre-push` 文件。

### 使用方法

1. **确保 .env.production 文件存在**
   ```bash
   # 检查文件是否存在
   ls -la .env.production
   ```

2. **正常进行 Git 操作**
   ```bash
   git add .
   git commit -m "your commit message"
   git push origin main
   ```

3. **观察钩子执行**
   
   Push 完成后，你会看到类似以下输出：
   ```
   🚀 开始同步 .env.production 文件到服务器...
   📁 正在传输 .env.production 到服务器...
   ✅ .env.production 文件已成功同步到服务器
   🔄 正在重启服务器上的Docker服务...
   ✅ Docker服务已重启完成
   🎉 同步完成！
   ```

### 故障排除

#### 1. 权限问题
```bash
# 确保钩子脚本有执行权限
chmod +x .git/hooks/pre-push
```

#### 2. SSH 连接问题
```bash
# 测试 SSH 连接
ssh root@SERVER_HOST "echo 'SSH connection successful'"
```

#### 3. 文件传输问题
```bash
# 手动测试 scp 传输
scp .env.production root@SERVER_HOST:/root/projects/stock-exchange-system/
```

#### 4. 禁用钩子
如果需要临时禁用钩子：
```bash
# 重命名钩子文件
mv .git/hooks/pre-push .git/hooks/pre-push.disabled
```

### 安全注意事项

1. **敏感信息**: `.env.production` 文件包含敏感信息，确保传输过程安全
2. **SSH 密钥**: 妥善保管 SSH 私钥，不要泄露
3. **服务器访问**: 确保只有授权人员可以访问生产服务器

### 自定义配置

如需修改服务器配置或添加其他功能，请编辑 `.git/hooks/pre-push` 文件：

```bash
# 编辑钩子脚本
vim .git/hooks/pre-push
```

常见自定义选项：
- 修改服务器地址和路径
- 添加备份功能
- 修改重启策略
- 添加通知功能
