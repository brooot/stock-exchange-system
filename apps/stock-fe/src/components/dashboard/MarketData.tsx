'use client';

import React from 'react';

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

interface LastTrade {
  price: number;
  quantity: number;
  batchSize?: number;
}

interface MarketDataProps {
  marketData: MarketData | null;
  lastTrade: LastTrade | null;
  isConnected: boolean;
}

export default function MarketDataComponent({ marketData, lastTrade, isConnected }: MarketDataProps) {
  return (
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

          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-blue-600">连接状态</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isConnected
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}>
                <span className={`w-2 h-2 rounded-full mr-1 ${
                  isConnected
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
                {lastTrade.batchSize && lastTrade.batchSize > 1 && (
                  <span className="ml-2 text-blue-600">(批量: {lastTrade.batchSize}笔)</span>
                )}
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
  );
}