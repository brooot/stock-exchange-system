'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { accountAPI, orderAPI, authAPI, tradeAPI, positionAPI } from '../../utils/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useKlineData } from '../../hooks/useKlineData';
import { AccountInfo, PositionTable, MarketData, TradingPanel, BotControl, KLineChart } from '../../components/dashboard';

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



export default function DashboardPage() {
  const router = useRouter();
  const { marketData, lastTrade, isConnected } = useWebSocket();
  const { klineData, currentInterval, isLoading: klineLoading, changeInterval, getSupportedIntervals } = useKlineData();

  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [portfolioValue, setPortfolioValue] = useState<number>(0);
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
          <AccountInfo
            accountInfo={accountInfo}
            portfolioValue={portfolioValue}
          />

          <PositionTable
            positions={positions}
            marketData={marketData}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MarketData
              marketData={marketData}
              isConnected={isConnected}
              lastTrade={lastTrade}
            />

            <BotControl />
          </div>

          <KLineChart
            data={klineData}
            interval={currentInterval}
            onIntervalChange={changeInterval}
            isLoading={klineLoading}
            getSupportedIntervals={getSupportedIntervals}
          />

          <TradingPanel
             marketData={marketData}
             onCreateOrder={async (orderData) => {
               setLoading(true);
               setError('');
               setSuccess('');

               try {
                 await orderAPI.createOrder(orderData);
                 setSuccess('订单提交成功！');
                 fetchAccountInfo();
                 fetchPositions();
               } catch (err: any) {
                 const errorMessage = err.response?.data?.message || '订单提交失败';
                 setError(errorMessage);
               } finally {
                 setLoading(false);
               }
             }}
             isLoading={loading}
             error={error}
             success={success}
           />
        </div>
      </div>
    </div>
  );
}
