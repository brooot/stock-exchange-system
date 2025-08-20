# Hosts 文件快速切换工具

## 概述

为了方便快速切换 `/etc/hosts` 文件中的域名映射（特别是 `www.brooot.top`），我们提供了两个便捷脚本。

## 脚本说明

### 1. `toggle-brooot.sh` - 一键切换脚本

最简单的使用方式，直接运行即可切换 `www.brooot.top` 的映射状态：

```bash
./toggle-brooot.sh
```

### 2. `scripts/toggle-hosts.sh` - 通用切换脚本

可以切换任意域名的映射：

```bash
# 切换 www.brooot.top
./scripts/toggle-hosts.sh www.brooot.top 127.0.0.1

# 切换其他域名
./scripts/toggle-hosts.sh example.com 192.168.1.100
```

## 脚本功能

- ✅ **智能切换**: 自动检测当前状态并切换（启用↔禁用）
- 🔒 **注释管理**: 通过注释/取消注释来控制映射
- ➕ **自动添加**: 如果映射不存在，会自动添加
- 🔄 **DNS刷新**: 自动刷新macOS的DNS缓存
- 📋 **状态显示**: 显示操作结果和当前配置

## 避免每次输入密码

### 方法1: 配置sudo免密（推荐）

1. 运行 `sudo visudo` 编辑sudoers文件
2. 在文件末尾添加以下行（将 `your_username` 替换为你的用户名）：

```
your_username ALL=(ALL) NOPASSWD: /usr/bin/sed, /usr/bin/grep, /usr/bin/tee, /usr/sbin/dscacheutil, /usr/bin/killall
```

3. 保存并退出（Ctrl+X, Y, Enter）

### 方法2: 使用别名和函数

在你的 `~/.zshrc` 或 `~/.bashrc` 中添加：

```bash
# 快速切换 hosts
alias toggle-hosts='cd /Users/brooot/Projects/stock-exchange-system && ./toggle-brooot.sh'
```

然后运行 `source ~/.zshrc` 重新加载配置。

之后在任何目录下都可以直接运行：
```bash
toggle-hosts
```

## 使用示例

```bash
# 第一次运行 - 启用映射
$ ./toggle-brooot.sh
🔄 切换 www.brooot.top 域名映射...
✅ 已启用: www.brooot.top -> 127.0.0.1

📋 当前 hosts 文件中的相关配置:
10:127.0.0.1 www.brooot.top

🔄 刷新DNS缓存...
✨ 完成!

# 第二次运行 - 禁用映射
$ ./toggle-brooot.sh
🔄 切换 www.brooot.top 域名映射...
🔒 已禁用: www.brooot.top -> 127.0.0.1

📋 当前 hosts 文件中的相关配置:
10:#127.0.0.1 www.brooot.top

🔄 刷新DNS缓存...
✨ 完成!
```

## 注意事项

- 脚本需要sudo权限来修改 `/etc/hosts` 文件
- 建议配置sudo免密以获得最佳体验
- 脚本会自动备份和恢复，安全可靠
- 支持macOS的DNS缓存刷新

## 故障排除

如果遇到权限问题，请确保：
1. 脚本有执行权限：`chmod +x toggle-brooot.sh`
2. 用户在sudo组中
3. 按照上述方法配置了sudo免密

如果DNS缓存刷新失败，可以手动运行：
```bash
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```