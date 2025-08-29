'use client';

import React from 'react';
import { useMarketStore } from '../../stores/marketStore';

interface Position {
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentValue?: number;
  unrealizedPnL?: number;
}

export default function PositionTable({ positions }: { positions: Position[] }) {
  const marketData = useMarketStore((s) => s.marketData);

  return (
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
                const currentPrice = marketData?.price ?? position.avgPrice;
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
  );
}