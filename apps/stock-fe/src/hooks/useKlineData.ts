import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  useKlineData as useKlineQuery,
  useRefreshKlineData,
} from './useKlineQuery';

interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  interval: string;
}

interface KlineUpdateEvent {
  interval: string;
  data: KlineData;
  isNewKline: boolean;
}

interface UseKlineDataParams {
  symbol?: string;
  initialInterval?: string;
}

export const useKlineData = (params: UseKlineDataParams = {}) => {
  const { symbol = 'AAPL', initialInterval = '1m' } = params;
  const [klineData, setKlineData] = useState<Record<string, KlineData[]>>({});
  const [currentInterval, setCurrentInterval] = useState(initialInterval);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Map<string, KlineData>>(new Map());

  // 使用 TanStack Query 获取K线数据
  const {
    data: queryKlineData,
    isLoading,
    error: queryError,
  } = useKlineQuery({
    symbol,
    interval: currentInterval,
    limit: 100,
    enabled: true,
  });

  // 获取刷新方法
  const { refreshKlineData } = useRefreshKlineData();

  // 同步 TanStack Query 数据到本地状态
  useEffect(() => {
    if (queryKlineData && queryKlineData.length > 0) {
      setKlineData((prev) => ({
        ...prev,
        [currentInterval]: queryKlineData,
      }));
    }
  }, [queryKlineData, currentInterval]);

  // 获取历史K线数据（兼容旧接口）
  const fetchKlineData = useCallback(
    async (interval: string, limit = 100) => {
      try {
        await refreshKlineData({ symbol, interval, limit });
      } catch (err) {
        console.error('获取K线数据失败:', err);
      }
    },
    [symbol, refreshKlineData]
  );

  const error = queryError ? (queryError as Error).message : null;

  // 节流更新函数
  const throttledUpdate = useCallback(() => {
    if (updateThrottleRef.current) {
      clearTimeout(updateThrottleRef.current);
    }

    updateThrottleRef.current = setTimeout(() => {
      const updates = Array.from(pendingUpdatesRef.current.entries());
      if (updates.length === 0) return;

      setKlineData((prev) => {
        const newData = { ...prev };

        updates.forEach(([interval, klineUpdate]) => {
          if (!newData[interval]) {
            newData[interval] = [];
          }

          const existingData = [...newData[interval]];
          const existingIndex = existingData.findIndex(
            (item) => item.timestamp === klineUpdate.timestamp
          );

          if (existingIndex >= 0) {
            // 更新现有K线
            existingData[existingIndex] = klineUpdate;
          } else {
            // 添加新K线，确保不重复添加
            const isDuplicate = existingData.some(
              (item) => item.timestamp === klineUpdate.timestamp
            );
            if (!isDuplicate) {
              existingData.push(klineUpdate);
              existingData.sort((a, b) => a.timestamp - b.timestamp);

              // 保持数据量在合理范围内
              if (existingData.length > 1000) {
                existingData.splice(0, existingData.length - 1000);
              }
            }
          }

          newData[interval] = existingData;
        });

        return newData;
      });

      // 清空待处理的更新
      pendingUpdatesRef.current.clear();
    }, 100); // 100ms 节流
  }, []);

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
  const handlePriceUpdate = useCallback(() => {
    // 这里可以添加实时价格更新的逻辑
  }, []);

  // 初始化WebSocket连接
  useEffect(() => {
    const socket = io(`${process.env.NEXT_PUBLIC_API_URL}/market`, {
      withCredentials: true,
    });

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
  }, [handleKlineUpdate, handlePriceUpdate]);

  // 当时间周期改变时，获取对应的历史数据
  useEffect(() => {
    if (!klineData[currentInterval]) {
      fetchKlineData(currentInterval);
    }
  }, [currentInterval, fetchKlineData]);

  // 切换时间周期
  const changeInterval = useCallback((newInterval: string) => {
    setCurrentInterval(newInterval);
  }, []);

  // 刷新当前时间周期的数据
  const refreshData = useCallback(() => {
    fetchKlineData(currentInterval);
  }, [currentInterval, fetchKlineData]);

  return {
    // 数据状态
    klineData: klineData[currentInterval] || [],
    allKlineData: klineData,
    currentInterval,
    isLoading,
    isConnected,
    error,

    // 操作方法
    changeInterval,
    refreshData,

    // WebSocket状态
    socket: socketRef.current,
  };
};
