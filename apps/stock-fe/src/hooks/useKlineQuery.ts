import { useQuery, useQueryClient } from '@tanstack/react-query';
import { klineAPI } from '../utils/api';
import { AxiosResponse } from 'axios';

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

interface UseKlineDataParams {
  symbol?: string;
  interval: string;
  limit?: number;
  enabled?: boolean;
}

// K线数据查询 hook
export const useKlineData = (params: UseKlineDataParams) => {
  const { symbol = 'AAPL', interval, limit = 100, enabled = true } = params;
  
  return useQuery({
    queryKey: ['klineData', symbol, interval, limit],
    queryFn: async (): Promise<KlineData[]> => {
      const response: AxiosResponse<KlineData[]> = await klineAPI.getKlineData({
        symbol,
        interval,
        limit,
      });
      
      // 确保数据按时间戳排序并去重
      const sortedData = response.data
        .filter(
          (item, index, arr) =>
            arr.findIndex((t) => t.timestamp === item.timestamp) === index
        )
        .sort((a, b) => a.timestamp - b.timestamp);
      
      return sortedData;
    },
    enabled,
    staleTime: 30 * 1000, // K线数据30秒后过期
    gcTime: 5 * 60 * 1000, // 缓存5分钟
  });
};

interface AvailableIntervalsResponse {
  intervals: string[];
}

// 可用时间间隔查询 hook
export const useAvailableIntervals = () => {
  return useQuery<AvailableIntervalsResponse>({
    queryKey: ['availableIntervals'],
    queryFn: async (): Promise<AvailableIntervalsResponse> => {
      const response = await klineAPI.getAvailableIntervals();
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 时间间隔配置10分钟后过期
    gcTime: 30 * 60 * 1000, // 缓存30分钟
  });
};

// 预取K线数据的 hook
export const usePrefetchKlineData = () => {
  const queryClient = useQueryClient();
  
  const prefetchKlineData = (params: UseKlineDataParams) => {
    const { symbol = 'AAPL', interval, limit = 100 } = params;
    
    return queryClient.prefetchQuery({
      queryKey: ['klineData', symbol, interval, limit],
      queryFn: async (): Promise<KlineData[]> => {
        const response: AxiosResponse<KlineData[]> = await klineAPI.getKlineData({
          symbol,
          interval,
          limit,
        });
        
        const sortedData = response.data
          .filter(
            (item, index, arr) =>
              arr.findIndex((t) => t.timestamp === item.timestamp) === index
          )
          .sort((a, b) => a.timestamp - b.timestamp);
        
        return sortedData;
      },
      staleTime: 30 * 1000,
    });
  };
  
  return { prefetchKlineData };
};

// 手动刷新K线数据的 hook
export const useRefreshKlineData = () => {
  const queryClient = useQueryClient();
  
  const refreshKlineData = (params: {
    symbol?: string;
    interval: string;
    limit?: number;
  }) => {
    const { symbol = 'AAPL', interval, limit = 100 } = params;
    
    return queryClient.invalidateQueries({
      queryKey: ['klineData', symbol, interval, limit],
    });
  };
  
  const refreshAllKlineData = () => {
    return queryClient.invalidateQueries({
      queryKey: ['klineData'],
    });
  };
  
  return { refreshKlineData, refreshAllKlineData };
};