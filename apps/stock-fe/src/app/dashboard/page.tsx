'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AccountInfo {
  balance: number;
  positions: {
    symbol: string;
    quantity: number;
  }[];
}

interface OrderForm {
  type: 'BUY' | 'SELL';
  price: string;
  quantity: string;
}

export default function DashboardPage() {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [orderForm, setOrderForm] = useState<OrderForm>({ type: 'BUY', price: '', quantity: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }
    fetchAccountInfo();
  }, [router]);

  const fetchAccountInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/account', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAccountInfo(data);
      } else {
        setError('获取账户信息失败');
      }
    } catch (err) {
      setError('网络错误');
    }
  };

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: orderForm.type,
          price: parseFloat(orderForm.price),
          quantity: parseInt(orderForm.quantity),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuccess(`订单创建成功！订单ID: ${data.id}`);
        setOrderForm({ type: 'BUY', price: '', quantity: '' });
        fetchAccountInfo(); // 刷新账户信息
      } else {
        const errorData = await response.json();
        setError(errorData.message || '订单创建失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    router.push('/auth');
  };

  const username = localStorage.getItem('username');
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 账户信息 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">账户信息</h2>
              {accountInfo ? (
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">账户余额:</span>
                    <span className="font-medium text-green-600">
                      ${accountInfo.balance}
                    </span>
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
          </div>

          {/* 交易面板 */}
          <div className="lg:col-span-2">
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
