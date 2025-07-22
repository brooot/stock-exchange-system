'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { accountAPI, orderAPI, authAPI, tradeAPI } from '../../utils/api';

interface AccountInfo {
  balance: string;
  positions: Array<{
    symbol: string;
    quantity: number;
  }>;
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
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [orderForm, setOrderForm] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    price: '',
    quantity: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  useEffect(() => {
    // 由于token现在存储在httpOnly cookie中，我们无法直接检查
    // 让后端API调用来验证认证状态
    fetchAccountInfo();
    fetchMarketData();

    // 每5秒刷新市场数据
    const interval = setInterval(fetchMarketData, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const fetchAccountInfo = async () => {
    try {
      const response = await accountAPI.getAccountInfo();
      setAccountInfo(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        // 401错误已在拦截器中处理，会自动跳转到登录页
        return;
      }
      setError('获取账户信息失败');
    }
  };

  const fetchMarketData = async () => {
    try {
      const response = await tradeAPI.getMarketData();
      setMarketData(response.data);
    } catch (err: any) {
      console.error('获取市场数据失败:', err);
    }
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
      // 重新获取账户信息
      fetchAccountInfo();
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">账户余额:</span>
                    <span className="font-medium text-green-600">
                      ${accountInfo.balance}
                    </span>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">持仓信息:</h3>
                  {accountInfo.positions.length > 0 ? (
                    <div className="space-y-2">
                      {accountInfo.positions.map((position, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span>{position.symbol}:</span>
                          <span>{position.quantity} 股</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">暂无持仓</p>
                  )}
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
                    <span className="text-sm text-blue-600">市场状态</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-1 animate-pulse"></span>
                      交易中
                    </span>
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    数据每5秒自动更新
                  </div>
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
