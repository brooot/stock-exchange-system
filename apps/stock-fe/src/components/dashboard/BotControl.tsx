'use client';

import React, { useState, useEffect } from 'react';
import { botAPI } from '../../utils/api';

interface BotStatus {
  isRunning: boolean;
  botCount: number;
  totalOrders: number;
  lastActivity?: string;
}

interface BotControlProps {
  className?: string;
}

export default function BotControl({ className = '' }: BotControlProps) {
  const [botStatus, setBotStatus] = useState<BotStatus>({
    isRunning: false,
    botCount: 0,
    totalOrders: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 获取机器人状态
  const fetchBotStatus = async () => {
    try {
      const response = await botAPI.getBotStatus();
      setBotStatus(response.data);
    } catch (err: any) {
      console.error('获取机器人状态失败:', err);
      setError('获取机器人状态失败');
    }
  };

  // 启动机器人
  const startBot = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      await botAPI.startBotTrading();
      setSuccess('机器人交易已启动');
      await fetchBotStatus();
    } catch (err: any) {
      setError(err.response?.data?.message || '启动机器人失败');
    } finally {
      setLoading(false);
    }
  };

  // 停止机器人
  const stopBot = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      await botAPI.stopBotTrading();
      setSuccess('机器人交易已停止');
      await fetchBotStatus();
    } catch (err: any) {
      setError(err.response?.data?.message || '停止机器人失败');
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时获取状态
  useEffect(() => {
    fetchBotStatus();
    
    // 定期刷新状态
    const interval = setInterval(fetchBotStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // 清除消息
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">机器人交易控制</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            botStatus.isRunning ? 'bg-green-500' : 'bg-gray-400'
          }`}></div>
          <span className={`text-sm font-medium ${
            botStatus.isRunning ? 'text-green-600' : 'text-gray-500'
          }`}>
            {botStatus.isRunning ? '运行中' : '已停止'}
          </span>
        </div>
      </div>

      {/* 状态信息 */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-sm text-gray-600">机器人数量</div>
          <div className="text-lg font-semibold text-gray-900">{botStatus.botCount}</div>
        </div>
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-sm text-gray-600">活跃订单</div>
          <div className="text-lg font-semibold text-gray-900">{botStatus.totalOrders}</div>
        </div>
      </div>

      {/* 最后活动时间 */}
      {botStatus.lastActivity && (
        <div className="mb-4">
          <div className="text-sm text-gray-600">最后活动时间</div>
          <div className="text-sm text-gray-900">
            {new Date(botStatus.lastActivity).toLocaleString()}
          </div>
        </div>
      )}

      {/* 错误和成功消息 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm text-green-600">{success}</div>
        </div>
      )}

      {/* 控制按钮 */}
      <div className="flex space-x-3">
        <button
          onClick={startBot}
          disabled={loading || botStatus.isRunning}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
            botStatus.isRunning
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50'
          }`}
        >
          {loading ? '启动中...' : '启动机器人'}
        </button>
        
        <button
          onClick={stopBot}
          disabled={loading || !botStatus.isRunning}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
            !botStatus.isRunning
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50'
          }`}
        >
          {loading ? '停止中...' : '停止机器人'}
        </button>
      </div>

      {/* 说明文字 */}
      <div className="mt-4 text-xs text-gray-500">
        <p>机器人会在当前市场价格附近自动下单，模拟真实交易环境。</p>
        <p>过期订单会自动清理，避免内存占用过多。</p>
      </div>
    </div>
  );
}