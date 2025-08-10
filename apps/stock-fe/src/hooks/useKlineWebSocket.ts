/**
 * K线图WebSocket连接自定义Hook
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { KlineData, KlineUpdateEvent, PriceUpdateEvent } from '../types/klineTypes';
import { getIntervalInMs } from '../utils/klineUtils';

interface UseKlineWebSocketProps {
  symbol: string;
  currentInterval: string;
  onKlineUpdate: (data: KlineData, interval: string) => void;
  onPriceUpdate?: (priceUpdate: PriceUpdateEvent) => void;
}

export const useKlineWebSocket = ({
  symbol,
  currentInterval,
  onKlineUpdate,
  onPriceUpdate
}: UseKlineWebSocketProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Map<string, KlineData>>(new Map());
  
  // 使用ref保存最新的symbol和currentInterval值，避免WebSocket重新连接
  const symbolRef = useRef(symbol);
  const currentIntervalRef = useRef(currentInterval);
  
  // 更新ref值
  useEffect(() => {
    symbolRef.current = symbol;
  }, [symbol]);

  useEffect(() => {
    currentIntervalRef.current = currentInterval;
  }, [currentInterval]);

  // 节流更新函数
  const throttledUpdate = useCallback(() => {
    if (updateThrottleRef.current) {
      clearTimeout(updateThrottleRef.current);
    }

    updateThrottleRef.current = setTimeout(() => {
      const updates = Array.from(pendingUpdatesRef.current.entries());
      if (updates.length === 0) return;

      updates.forEach(([interval, klineUpdate]) => {
        onKlineUpdate(klineUpdate, interval);
      });

      // 清空待处理的更新
      pendingUpdatesRef.current.clear();
    }, 100); // 100ms 节流
  }, [onKlineUpdate]);

  // 处理K线更新事件
  const handleKlineUpdate = useCallback(
    (updateEvent: KlineUpdateEvent) => {
      const { interval, data: klineUpdate } = updateEvent;

      // 将更新添加到待处理队列
      pendingUpdatesRef.current.set(interval, klineUpdate);

      // 触发节流更新
      throttledUpdate();
    },
    [throttledUpdate]
  );

  // 处理价格更新事件（用于实时价格显示）
  const handlePriceUpdate = useCallback((priceUpdate: PriceUpdateEvent) => {
    const { symbol: updateSymbol } = priceUpdate;

    // 通过ref获取最新的symbol值
    const currentSymbol = symbolRef.current;

    // 只处理当前股票的价格更新
    if (updateSymbol !== currentSymbol) return;

    // 调用外部传入的价格更新处理函数
    onPriceUpdate?.(priceUpdate);
  }, [onPriceUpdate]);

  // 初始化WebSocket连接
  useEffect(() => {
    const socket = io(
      `${process.env.NEXT_PUBLIC_API_URL}/market`,
      {
        withCredentials: true,
      }
    );

    socketRef.current = socket;

    // 连接事件
    socket.on('connect', () => {
      console.log('K线数据WebSocket已连接');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('K线数据WebSocket已断开');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('K线数据WebSocket连接错误:', err);
      setIsConnected(false);
    });

    // K线数据更新事件
    socket.on('klineUpdate', handleKlineUpdate);

    // 价格更新事件
    socket.on('priceUpdate', handlePriceUpdate);

    return () => {
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
      }
      socket.disconnect();
    };
  }, []); // 移除依赖项，避免WebSocket重新连接

  return {
    isConnected,
    socket: socketRef.current
  };
};