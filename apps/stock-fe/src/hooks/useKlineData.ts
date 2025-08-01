import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

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

interface PriceUpdateEvent {
  symbol: string;
  price: number;
  volume: number;
  timestamp: Date;
  tradeId: number;
}

export const useKlineData = (initialInterval = '1m') => {
  const [klineData, setKlineData] = useState<Record<string, KlineData[]>>({});
  const [currentInterval, setCurrentInterval] = useState(initialInterval);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Map<string, KlineData>>(new Map());

  // 获取历史K线数据
  const fetchKlineData = useCallback(async (interval: string, limit = 100) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `http://${process.env.NEXT_PUBLIC_BACKEND_HOST}:${process.env.NEXT_PUBLIC_BACKEND_PORT}/api/kline?interval=${interval}&limit=${limit}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: KlineData[] = await response.json();

      // 确保数据按时间戳排序并去重
      const sortedData = data
        .filter(
          (item, index, arr) =>
            arr.findIndex((t) => t.timestamp === item.timestamp) === index
        )
        .sort((a, b) => a.timestamp - b.timestamp);

      setKlineData((prev) => ({
        ...prev,
        [interval]: sortedData,
      }));
    } catch (err) {
      console.error('获取K线数据失败:', err);
      setError(err instanceof Error ? err.message : '获取K线数据失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
  const handlePriceUpdate = useCallback((priceUpdate: PriceUpdateEvent) => {
    // 这里可以添加实时价格更新的逻辑
    // console.log('价格更新:', priceUpdate);
  }, []);

  // 初始化WebSocket连接
  useEffect(() => {
    const socket = io(
      `http://${process.env.NEXT_PUBLIC_BACKEND_HOST}:${process.env.NEXT_PUBLIC_BACKEND_PORT}/market`,
      {
        withCredentials: true,
      }
    );

    socketRef.current = socket;

    // 连接事件
    socket.on('connect', () => {
      console.log('K线数据WebSocket已连接');
      setIsConnected(true);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('K线数据WebSocket已断开');
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('K线数据WebSocket连接错误:', err);
      setError('WebSocket连接失败');
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

  // 获取支持的时间周期
  const getSupportedIntervals = useCallback(async () => {
    try {
      const response = await fetch(
        `http://${process.env.NEXT_PUBLIC_BACKEND_HOST}:${process.env.NEXT_PUBLIC_BACKEND_PORT}/api/kline/intervals`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.intervals;
    } catch (err) {
      console.error('获取支持的时间周期失败:', err);
      return ['1m', '5m', '15m', '1h', '1d']; // 返回默认值
    }
  }, []);

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
    getSupportedIntervals,

    // WebSocket状态
    socket: socketRef.current,
  };
};
