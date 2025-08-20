'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Decimal from 'decimal.js';
import { useAccountInfo, useUserPositions, useCreateOrder } from '../../hooks/useApiQueries';
import { useWebSocket } from '../../hooks/useWebSocket';
import { AccountInfo, PositionTable, MarketData, TradingPanel, BotControl, KLineChart } from '../../components/dashboard';

interface Position {
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
  const { marketData, lastTrade, isConnected } = useWebSocket();

  const { data: accountResponse } = useAccountInfo();
  const { data: positionsResponse } = useUserPositions();
  const createOrderMutation = useCreateOrder();

  const [portfolioValue, setPortfolioValue] = useState<number>(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const accountInfo = useMemo(() => {
    return accountResponse?.data ? {
      balance: accountResponse.data.balance.toString()
    } : null;
  }, [accountResponse?.data]);

  const positions = useMemo(() => {
    return (positionsResponse?.data || []).map((position, index) => ({
      ...position,
      id: `${position.symbol}-${index}` // 为每个持仓添加唯一 id
    }));
  }, [positionsResponse?.data]);

  // 当持仓更新时，重新计算投资组合价值
  useEffect(() => {
    calculatePortfolioValue();
  }, [positions]);



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


  // 稳定KLineChart的props
  const klineChartProps = useMemo(() => ({
    symbol: "AAPL" as const,
    initialInterval: "1m" as const
  }), []);

  // 稳定TradingPanel的onCreateOrder回调
  const handleCreateOrder = useCallback(async (orderData: any) => {
    setError('');
    setSuccess('');

    try {
      await createOrderMutation.mutateAsync(orderData);
      setSuccess('订单提交成功！');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || '订单提交失败';
      setError(errorMessage);
    }
  }, [createOrderMutation]);




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
            symbol={klineChartProps.symbol}
            initialInterval={klineChartProps.initialInterval}
          />

          <TradingPanel
            marketData={marketData}
            onCreateOrder={handleCreateOrder}
            isLoading={createOrderMutation.isPending}
            error={error}
            success={success}
          />
        </div>
      </div>
    </div>
  );
}
