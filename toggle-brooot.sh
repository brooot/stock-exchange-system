#!/bin/bash

# HTTPS代理控制脚本
# 使用方法: 
#   https-proxy on  - 启用本地代理 (www.brooot.top -> 127.0.0.1)
#   https-proxy off - 禁用本地代理 (注释掉hosts条目)

DOMAIN="www.brooot.top"
IP="127.0.0.1"
HOSTS_FILE="/etc/hosts"
LINE="$IP $DOMAIN"

case "$1" in
    "on")
        echo "🔛 启用 HTTPS 代理: $DOMAIN -> $IP"
        # 检查是否已存在未注释的条目
        if grep -q "^$LINE" "$HOSTS_FILE"; then
            echo "✅ 代理已经启用"
        elif grep -q "^#$LINE" "$HOSTS_FILE"; then
            # 取消注释
            sudo sed -i '' "s/^#$IP $DOMAIN/$IP $DOMAIN/" "$HOSTS_FILE"
            echo "✅ 已启用代理"
        else
            # 添加新条目
            echo "$LINE" | sudo tee -a "$HOSTS_FILE" > /dev/null
            echo "✅ 已添加并启用代理"
        fi
        ;;
    "off")
        echo "🔴 禁用 HTTPS 代理: $DOMAIN"
        # 注释掉条目
        if grep -q "^$LINE" "$HOSTS_FILE"; then
            sudo sed -i '' "s/^$IP $DOMAIN/#$IP $DOMAIN/" "$HOSTS_FILE"
            echo "✅ 已禁用代理"
        else
            echo "ℹ️  代理已经禁用或不存在"
        fi
        ;;
    *)
        echo "❌ 用法错误"
        echo "使用方法:"
        echo "  https-proxy on   - 启用本地代理"
        echo "  https-proxy off  - 禁用本地代理"
        exit 1
        ;;
esac

# 显示当前状态
echo "📋 当前 hosts 文件中的相关配置:"
grep -n "$DOMAIN" "$HOSTS_FILE" || echo "   (未找到 $DOMAIN 相关配置)"

# 刷新DNS缓存 (macOS)
echo "🔄 刷新DNS缓存..."
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
echo "✨ 完成!"