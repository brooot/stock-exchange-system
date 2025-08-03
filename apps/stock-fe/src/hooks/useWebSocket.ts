import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { tradeAPI } from '../utils/api';

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

  // 获取初始市场数据
  const fetchInitialMarketData = async () => {
    try {
      const response = await tradeAPI.getMarketData();
      setMarketData(response.data);
    } catch (err: any) {
      console.error('获取市场数据失败:', err);
    }
  };

  useEffect(() => {
    // 获取初始市场数据
    fetchInitialMarketData();
    // 连接到WebSocket服务器
    const socket = io(
      `http://${process.env.NEXT_PUBLIC_BACKEND_HOST}:${process.env.NEXT_PUBLIC_BACKEND_PORT}/market`,
      {
        withCredentials: true,
      }
    );

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

    // 错误处理
    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    // 清理函数
    return () => {
      socket.disconnect();
    };
  }, []);

  return {
    marketData,
    lastTrade,
    isConnected,
    socket: socketRef.current,
  };
};
