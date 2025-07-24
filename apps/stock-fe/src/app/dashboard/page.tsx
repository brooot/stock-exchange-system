'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { accountAPI, orderAPI, authAPI, tradeAPI, positionAPI } from '../../utils/api';
import { useWebSocket } from '../../hooks/useWebSocket';

interface AccountInfo {
  balance: string;
}

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentValue?: number;
  unrealizedPnL?: number;
}

interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

interface OrderForm {
  type: 'BUY' | 'SELL';
  price: string;
  quantity: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { marketData, lastTrade, isConnected } = useWebSocket();

  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioValue, setPortfolioValue] = useState<number>(0);
  const [orderForm, setOrderForm] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    price: '',
    quantity: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // 由于token现在存储在httpOnly cookie中，我们无法直接检查
    // 让后端API调用来验证认证状态
    fetchAccountInfo();
    fetchPositions();
  }, [router]);

  // 当持仓更新时，重新计算投资组合价值
  useEffect(() => {
    calculatePortfolioValue();
  }, [positions]);

  const fetchAccountInfo = async () => {
    try {
      const response = await accountAPI.getAccountInfo();
      console.log('===> response.data: ', response.data);
      setAccountInfo(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        // 401错误已在拦截器中处理，会自动跳转到登录页
        return;
      }
      setError('获取账户信息失败');
    }
  };

  const fetchPositions = async () => {
    try {
      const response = await positionAPI.getUserPositions();
      setPositions(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        return;
      }
      console.error('获取持仓信息失败:', err);
    }
  };

  // 计算投资组合总价值
  const calculatePortfolioValue = () => {
    if (!positions.length) {
      setPortfolioValue(0);
      return;
    }

    let totalValue = new Decimal(0);

    positions.forEach((position) => {
      // 目前使用平均成本价计算，后续可以集成实时价格API
      const currentPrice = position.avgPrice;
      const positionValue = new Decimal(position.quantity).mul(new Decimal(currentPrice));
      totalValue = totalValue.add(positionValue);
    });

    setPortfolioValue(totalValue.toNumber());
  };



  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await orderAPI.createOrder({
        type: orderForm.type,
        price: parseFloat(orderForm.price),
        quantity: parseInt(orderForm.quantity),
      });

      setSuccess('订单提交成功！');
      setOrderForm({ type: 'BUY', price: '', quantity: '' });
      // 重新获取账户信息和持仓信息
      fetchAccountInfo();
      fetchPositions();
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || '订单提交失败';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.error('退出登录失败:', err);
    } finally {
      localStorage.removeItem('username');
      router.push('/auth');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* 账户信息 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">账户信息</h2>
            {accountInfo ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">现金余额:</span>
                    <span className="font-medium text-green-600">
                      ${accountInfo.balance}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">投资组合价值:</span>
                    <span className="font-medium text-blue-600">
                      ${portfolioValue}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">总资产:</span>
                    <span className="font-medium text-purple-600">
                      ${(parseFloat(accountInfo.balance) + portfolioValue).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </div>
            )}
          </div>

          {/* 持仓信息 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">持仓信息</h2>
            {positions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        股票代码
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        持仓数量
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        平均成本
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        当前价格
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        市值
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        未实现盈亏
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {positions.map((position) => {
                      const currentPrice = marketData?.price || position.avgPrice;
                      const currentValue = position.quantity * currentPrice;
                      const unrealizedPnL = position.quantity * (currentPrice - position.avgPrice);
                      const pnlPercent = ((currentPrice - position.avgPrice) / position.avgPrice) * 100;

                      return (
                        <tr key={position.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {position.symbol}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {position.quantity} 股
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${position.avgPrice}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${currentPrice}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            ${currentValue.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className={`${unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${unrealizedPnL.toFixed(2)}
                              <div className="text-xs">
                                ({unrealizedPnL >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">暂无持仓</p>
              </div>
            )}
          </div>

          {/* 市场行情 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">市场行情</h2>
            {marketData ? (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{marketData.symbol}</h3>
                    <p className="text-gray-600">苹果公司</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gray-900">
                      ${marketData.price.toFixed(2)}
                    </div>
                    <div className={`text-sm font-medium ${marketData.change >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {marketData.change >= 0 ? '+' : ''}{marketData.change.toFixed(2)}
                      ({marketData.changePercent >= 0 ? '+' : ''}{(marketData.changePercent * 100).toFixed(2)}%)
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-sm text-gray-600">开盘价</div>
                    <div className="text-lg font-semibold">${marketData.open.toFixed(2)}</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-sm text-gray-600">最高价</div>
                    <div className="text-lg font-semibold text-green-600">${marketData.high.toFixed(2)}</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-sm text-gray-600">最低价</div>
                    <div className="text-lg font-semibold text-red-600">${marketData.low.toFixed(2)}</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-sm text-gray-600">成交量</div>
                    <div className="text-lg font-semibold">{marketData.volume.toLocaleString()}</div>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-600">连接状态</span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isConnected
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                      }`}>
                      <span className={`w-2 h-2 rounded-full mr-1 ${isConnected
                        ? 'bg-green-400 animate-pulse'
                        : 'bg-red-400'
                        }`}></span>
                      {isConnected ? 'WebSocket已连接' : 'WebSocket断开'}
                    </span>
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    {isConnected ? '实时数据推送' : '等待连接...'}
                  </div>
                  {lastTrade && (
                    <div className="text-xs text-green-600 mt-2">
                      最新交易: ${lastTrade.price.toFixed(2)} × {lastTrade.quantity}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded mb-4"></div>
                <div className="h-12 bg-gray-200 rounded mb-4"></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="h-16 bg-gray-200 rounded"></div>
                  <div className="h-16 bg-gray-200 rounded"></div>
                  <div className="h-16 bg-gray-200 rounded"></div>
                  <div className="h-16 bg-gray-200 rounded"></div>
                </div>
              </div>
            )}
          </div>

          {/* 交易面板 */}
          <div>
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">交易面板</h2>

              {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
                  {success}
                </div>
              )}

              <form onSubmit={handleOrder} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    交易类型
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="type"
                        value="BUY"
                        checked={orderForm.type === 'BUY'}
                        onChange={(e) => setOrderForm({ ...orderForm, type: e.target.value as 'BUY' | 'SELL' })}
                        className="mr-2"
                      />
                      <span className="text-green-600 font-medium">买入</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="type"
                        value="SELL"
                        checked={orderForm.type === 'SELL'}
                        onChange={(e) => setOrderForm({ ...orderForm, type: e.target.value as 'BUY' | 'SELL' })}
                        className="mr-2"
                      />
                      <span className="text-red-600 font-medium">卖出</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      价格 ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={orderForm.price}
                      onChange={(e) => setOrderForm({ ...orderForm, price: e.target.value })}
                      placeholder="输入价格"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      数量 (股)
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={orderForm.quantity}
                      onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
                      placeholder="输入数量"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-md">
                  <div className="text-sm text-gray-600 mb-2">订单预览:</div>
                  <div className="text-sm">
                    <span className={orderForm.type === 'BUY' ? 'text-green-600' : 'text-red-600'}>
                      {orderForm.type === 'BUY' ? '买入' : '卖出'}
                    </span>
                    <span className="mx-2">AAPL</span>
                    <span>{orderForm.quantity || '0'} 股</span>
                    <span className="mx-2">@</span>
                    <span>${orderForm.price || '0.00'}</span>
                  </div>
                  {orderForm.price && orderForm.quantity && (
                    <div className="text-sm text-gray-600 mt-1">
                      总金额: ${(parseFloat(orderForm.price) * parseInt(orderForm.quantity || '0')).toFixed(2)}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-2 px-4 rounded-md font-medium focus:outline-none focus:ring-2 disabled:opacity-50 ${orderForm.type === 'BUY'
                    ? 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                    : 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
                    }`}
                >
                  {loading ? '提交中...' : `确认${orderForm.type === 'BUY' ? '买入' : '卖出'}`}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
