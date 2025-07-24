import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

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
}

export const useWebSocket = () => {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [lastTrade, setLastTrade] = useState<TradeData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // 连接到WebSocket服务器
    const socket = io('http://localhost:3001/market', {
      withCredentials: true,
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
      console.log('Market data received:', data);
      setMarketData(data);
    });

    // 监听交易完成事件
    socket.on('tradeCompleted', (data: TradeData) => {
      console.log('Trade completed:', data);
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