#!/bin/bash

# 快速切换 /etc/hosts 中的域名映射
# 使用方法: ./toggle-hosts.sh [domain] [ip]
# 例如: ./toggle-hosts.sh www.brooot.top 127.0.0.1

DOMAIN=${1:-"www.brooot.top"}
IP=${2:-"127.0.0.1"}
HOSTS_FILE="/etc/hosts"
LINE="$IP $DOMAIN"

# 检查是否有sudo权限
if ! sudo -n true 2>/dev/null; then
    echo "❌ 需要sudo权限来修改 /etc/hosts 文件"
    echo "💡 建议运行: sudo visudo 添加以下行来避免每次输入密码:"
    echo "   $USER ALL=(ALL) NOPASSWD: /usr/bin/sed, /usr/bin/grep, /usr/bin/tee, /usr/sbin/dscacheutil, /usr/bin/killall"
    echo ""
    echo "🔧 或者现在输入密码继续操作:"
    if ! sudo -v; then
        echo "❌ 无法获取sudo权限，退出"
        exit 1
    fi
fi

# 检查当前状态
if grep -q "^$LINE" "$HOSTS_FILE"; then
    # 如果存在未注释的行，则注释掉
    sudo sed -i '' "s/^$IP $DOMAIN/#$IP $DOMAIN/" "$HOSTS_FILE"
    echo "🔒 已禁用: $DOMAIN -> $IP"
elif grep -q "^#$LINE" "$HOSTS_FILE"; then
    # 如果存在注释的行，则取消注释
    sudo sed -i '' "s/^#$IP $DOMAIN/$IP $DOMAIN/" "$HOSTS_FILE"
    echo "✅ 已启用: $DOMAIN -> $IP"
else
    # 如果不存在，则添加
    echo "$LINE" | sudo tee -a "$HOSTS_FILE" > /dev/null
    echo "➕ 已添加: $DOMAIN -> $IP"
fi

# 显示当前相关配置
echo "📋 当前 hosts 文件中的相关配置:"
grep -n "$DOMAIN" "$HOSTS_FILE" || echo "   (未找到 $DOMAIN 相关配置)"

# 刷新DNS缓存 (macOS)
echo "🔄 刷新DNS缓存..."
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
echo "✨ 完成!"
