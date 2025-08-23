import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useMarketData } from './useApiQueries';
import type { PriceUpdateEvent } from '../types/klineTypes';

interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: Date;
}

interface TradeData {
  symbol: string;
  price: number;
  quantity: number;
  timestamp: Date;
  tradeId: string;
  batchSize?: number; // 批量交易的数量，单个交易时为undefined
}

export const useWebSocket = () => {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [lastTrade, setLastTrade] = useState<TradeData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // 使用 TanStack Query 获取初始市场数据
  const { data: marketDataResponse } = useMarketData();

  // 设置初始市场数据的独立effect
  useEffect(() => {
    if (marketDataResponse?.data) {
      setMarketData(marketDataResponse.data);
    }
  }, [marketDataResponse?.data]);

  // WebSocket连接的独立effect
  useEffect(() => {
    // 连接到WebSocket服务器
    const socket = io(`${process.env.NEXT_PUBLIC_WS_URL}/market`, {
      withCredentials: true,
      // 显式指定 Socket.IO 路径，避免在 Next.js 下被 /api 前缀影响
      path: '/socket.io',
    });

    socketRef.current = socket;

    // 连接事件
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    // 监听市场数据更新
    socket.on('marketUpdate', (data: MarketData) => {
      // console.log('Market data received:', data);
      setMarketData(data);
    });

    // 监听交易完成事件
    socket.on('tradeCompleted', (data: TradeData) => {
      // console.log('Trade completed:', data);
      setLastTrade(data);
    });

    // 监听价格更新事件，增强 MarketData 的实时性
    socket.on('priceUpdate', (update: PriceUpdateEvent) => {
      setMarketData((prev) => {
        if (!prev || update.symbol !== prev.symbol) return prev;

        const newPrice = update.price;
        const open = prev.open;
        const high = Math.max(prev.high, newPrice);
        const low = Math.min(prev.low, newPrice);
        const change = newPrice - open;
        const changePercent = open ? change / open : 0;
        const volume = (prev.volume ?? 0) + update.volume;

        return {
          ...prev,
          price: newPrice,
          high,
          low,
          change,
          changePercent,
          volume,
          timestamp: new Date(update.timestamp),
        };
      });
    });

    // 错误处理
    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // 清理函数
    return () => {
      socket.disconnect();
    };
  }, []); // 空依赖数组，只在组件挂载时执行一次

  return {
    marketData,
    lastTrade,
    isConnected,
    socket: socketRef.current,
  };
};
