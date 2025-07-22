'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { tradeAPI } from '../../utils/api';

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

interface RecentTrade {
  id: number;
  price: string;
  quantity: number;
  executedAt: string;
  buyOrder: {
    user: {
      username: string;
    };
  };
  sellOrder: {
    user: {
      username: string;
    };
  };
}

export default function MarketPage() {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const hasLogin = localStorage.getItem('username');
    if (!hasLogin) {
      router.push('/auth');
      return;
    }
    fetchMarketData();

    // 每5秒刷新一次数据
    const interval = setInterval(fetchMarketData, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const fetchMarketData = async () => {
    try {
      // 获取最近交易记录
      const response = await tradeAPI.getMyTrades();
      const tradesData = response.data;
      console.log('===> tradesData: ', tradesData);
      setRecentTrades(tradesData.slice(0, 10)); // 只显示最近10条

      // 模拟市场数据（基于最近交易）
      if (tradesData.length > 0) {
        const latestTrade = tradesData[0];
        const currentPrice = parseFloat(latestTrade.price);

        // 模拟市场数据
        const mockMarketData: MarketData = {
          symbol: 'AAPL',
          price: currentPrice,
          change: Math.random() * 10 - 5, // -5 到 +5 的随机变化
          changePercent: (Math.random() * 10 - 5) / 100, // -5% 到 +5% 的随机变化
          volume: Math.floor(Math.random() * 1000000) + 100000,
          high: currentPrice + Math.random() * 5,
          low: currentPrice - Math.random() * 5,
          open: currentPrice + (Math.random() * 4 - 2),
        };

        setMarketData(mockMarketData);
      } else {
        // 默认市场数据
        setMarketData({
          symbol: 'AAPL',
          price: 150.00,
          change: 0,
          changePercent: 0,
          volume: 0,
          high: 150.00,
          low: 150.00,
          open: 150.00,
        });
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        // 401错误已在拦截器中处理，会自动跳转到登录页
        return;
      }
      setError('获取市场数据失败');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('zh-CN');
  };

  const username = localStorage.getItem('username');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 导航栏 */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-blue-600 hover:text-blue-800 mr-4"
              >
                ← 返回交易面板
              </button>
              <h1 className="text-xl font-bold text-gray-900">实时行情</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">欢迎, {username}</span>
              <button
                onClick={() => router.push('/history')}
                className="text-blue-600 hover:text-blue-800"
              >
                交易历史
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 股票信息卡片 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              {loading || !marketData ? (
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded mb-4"></div>
                  <div className="h-12 bg-gray-200 rounded mb-4"></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">{marketData.symbol}</h2>
                      <p className="text-gray-600">苹果公司</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-gray-900">
                        ${marketData.price.toFixed(2)}
                      </div>
                      <div className={`text-sm font-medium ${
                        marketData.change >= 0 ? 'text-green-600' : 'text-red-600'
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

                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
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
              )}
            </div>
          </div>

          {/* 最近交易 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">最近交易</h3>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : recentTrades.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentTrades.map((trade) => (
                    <div key={trade.id} className="border-b border-gray-100 pb-3 last:border-b-0">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-900">
                              ${trade.price}
                            </span>
                            <span className="text-sm text-gray-600">
                              {trade.quantity}股
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {formatTime(trade.executedAt)}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            买方: {trade.buyOrder.user.username} | 卖方: {trade.sellOrder.user.username}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  暂无交易记录
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 快速交易按钮 */}
        <div className="mt-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">快速交易</h3>
            <div className="flex space-x-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 font-medium"
              >
                买入 AAPL
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 bg-red-600 text-white py-3 px-4 rounded-md hover:bg-red-700 font-medium"
              >
                卖出 AAPL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
