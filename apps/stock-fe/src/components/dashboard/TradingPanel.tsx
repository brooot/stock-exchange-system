'use client';

import React, { useState } from 'react';
import { useMarketStore } from '../../stores/marketStore';

interface TradingPanelProps {
  onCreateOrder: (orderData: {
    symbol: string;
    type: 'BUY' | 'SELL';
    method?: 'MARKET' | 'LIMIT';
    quantity: number;
    price: number;
  }) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  success: string | null;
}

export default function TradingPanel({
  onCreateOrder,
  isLoading,
  error,
  success
}: TradingPanelProps) {
  const marketData = useMarketStore((s) => s.marketData);
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderMethod, setOrderMethod] = useState<'MARKET' | 'LIMIT'>('LIMIT');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketData) return;

    const orderData: any = {
      symbol: marketData.symbol,
      type: orderType,
      method: orderMethod,
      quantity: parseInt(quantity),
    };

    // 只有限价单才传递price参数
    if (orderMethod === 'LIMIT') {
      orderData.price = parseFloat(price);
    }

    await onCreateOrder(orderData);

    // 清空表单
    setQuantity('');
    if (orderMethod === 'LIMIT') {
      setPrice('');
    }
  };

  const getEstimatedPrice = () => {
    if (orderMethod === 'MARKET' && marketData) {
      return marketData.price;
    }
    return price ? parseFloat(price) : 0;
  };

  const estimatedTotal = quantity && getEstimatedPrice() ?
    (parseInt(quantity) * getEstimatedPrice()).toFixed(2) : '0.00';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">交易面板</h2>

      {marketData && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 买卖选择 */}
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setOrderType('BUY')}
              className={`flex-1 py-2 px-4 rounded-md font-medium ${
                orderType === 'BUY'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              买入
            </button>
            <button
              type="button"
              onClick={() => setOrderType('SELL')}
              className={`flex-1 py-2 px-4 rounded-md font-medium ${
                orderType === 'SELL'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              卖出
            </button>
          </div>

          {/* 订单方式选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              订单方式
            </label>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setOrderMethod('LIMIT')}
                className={`flex-1 py-2 px-4 rounded-md font-medium text-sm ${
                  orderMethod === 'LIMIT'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                限价单
              </button>
              <button
                type="button"
                onClick={() => setOrderMethod('MARKET')}
                className={`flex-1 py-2 px-4 rounded-md font-medium text-sm ${
                  orderMethod === 'MARKET'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                市价单
              </button>
            </div>
          </div>

          {/* 股票信息 */}
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="flex justify-between items-center">
              <span className="font-medium">{marketData.symbol}</span>
              <span className="text-lg font-bold">${marketData.price.toFixed(2)}</span>
            </div>
          </div>

          {/* 价格输入 */}
          {orderMethod === 'LIMIT' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                限价 ($)
              </label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入限价"
                  step="0.01"
                  min="0.01"
                  required
                />
                <button
                  type="button"
                  onClick={() => setPrice(marketData.price.toString())}
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
                >
                  当前价
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                市价 ($)
              </label>
              <div className="bg-gray-50 px-3 py-2 border border-gray-300 rounded-md">
                <span className="text-gray-600">将以当前市价 ${marketData.price.toFixed(2)} 成交</span>
              </div>
            </div>
          )}

          {/* 数量输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              数量 (股)
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入股数"
              min="1"
              required
            />
          </div>

          {/* 预估总额 */}
          <div className="bg-blue-50 p-3 rounded-md">
            <div className="flex justify-between">
              <span className="text-sm text-blue-600">预估总额:</span>
              <span className="font-medium text-blue-800">${estimatedTotal}</span>
            </div>
          </div>

          {/* 错误和成功消息 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-sm text-green-600">{success}</p>
            </div>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={isLoading || !quantity || (orderMethod === 'LIMIT' && !price)}
            className={`w-full py-2 px-4 rounded-md font-medium ${
              orderType === 'BUY'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isLoading ? '处理中...' : `${orderMethod === 'MARKET' ? '市价' : '限价'}${orderType === 'BUY' ? '买入' : '卖出'} ${marketData.symbol}`}
          </button>
        </form>
      )}
    </div>
  );
}
