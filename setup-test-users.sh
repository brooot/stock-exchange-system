#!/bin/bash

# 设置测试用户的脚本
# 用途：重置数据库并创建两个测试用户

set -e  # 遇到错误立即退出

echo "=== 股票交易系统测试用户设置脚本 ==="
echo "开始时间: $(date)"
echo ""

# 步骤1: 重置Prisma数据库
echo "[步骤 1/3] 重置Prisma数据库..."
echo "执行命令: docker exec -w /app stock-exchange-system-stock-back-end-dev-1 npx prisma db push --force-reset"

if docker exec -w /app stock-exchange-system-stock-back-end-dev-1 npx prisma db push --force-reset; then
    echo "✅ 数据库重置成功"
else
    echo "❌ 数据库重置失败"
    exit 1
fi

echo "等待数据库稳定..."
sleep 3
echo ""

# 步骤2: 注册第一个用户 (brot)
echo "[步骤 2/3] 注册第一个用户 (brot)..."
echo "发送注册请求到: http://localhost/api/auth/register"

RESPONSE1=$(curl -s -w "\n%{http_code}" \
  'http://localhost:3001/api/auth/register' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Content-Type: application/json' \
  --data-raw '{"username":"brot","password":"112233"}')

# 分离响应体和状态码
HTTP_CODE1=$(echo "$RESPONSE1" | tail -n1)
RESPONSE_BODY1=$(echo "$RESPONSE1" | sed '$d')

echo "HTTP状态码: $HTTP_CODE1"
echo "响应内容: $RESPONSE_BODY1"

if [[ "$HTTP_CODE1" == "200" || "$HTTP_CODE1" == "201" ]]; then
    echo "✅ 用户 'brot' 注册成功"
elif [[ "$HTTP_CODE1" == "400" && "$RESPONSE_BODY1" == *"already exists"* ]]; then
    echo "⚠️  用户 'brot' 已存在，跳过注册"
else
    echo "❌ 用户 'brot' 注册失败 (HTTP: $HTTP_CODE1)"
    echo "响应: $RESPONSE_BODY1"
    exit 1
fi

echo "等待服务器处理..."
sleep 2
echo ""

# 步骤3: 注册第二个用户 (exchanger)
echo "[步骤 3/3] 注册第二个用户 (exchanger)..."
echo "发送注册请求到: http://localhost/api/auth/register"

RESPONSE2=$(curl -s -w "\n%{http_code}" \
  'http://localhost:3001/api/auth/register' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Content-Type: application/json' \
  --data-raw '{"username":"exchanger","password":"112233"}')

# 分离响应体和状态码
HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)
RESPONSE_BODY2=$(echo "$RESPONSE2" | sed '$d')

echo "HTTP状态码: $HTTP_CODE2"
echo "响应内容: $RESPONSE_BODY2"

if [[ "$HTTP_CODE2" == "200" || "$HTTP_CODE2" == "201" ]]; then
    echo "✅ 用户 'exchanger' 注册成功"
elif [[ "$HTTP_CODE2" == "400" && "$RESPONSE_BODY2" == *"already exists"* ]]; then
    echo "⚠️  用户 'exchanger' 已存在，跳过注册"
else
    echo "❌ 用户 'exchanger' 注册失败 (HTTP: $HTTP_CODE2)"
    echo "响应: $RESPONSE_BODY2"
    exit 1
fi

echo ""
echo "=== 脚本执行完成 ==="
echo "✅ 数据库已重置"
echo "✅ 测试用户已创建:"
echo "   - 用户名: brot, 密码: 112233"
echo "   - 用户名: exchanger, 密码: 112233"
echo "完成时间: $(date)"
echo ""
echo "现在可以使用这两个用户进行交易测试了！"
