import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  authAPI,
  accountAPI,
  orderAPI,
  tradeAPI,
  positionAPI,
  botAPI,
} from '../utils/api';
import { AxiosResponse } from 'axios';

// 类型定义
interface AccountInfo {
  id: number;
  username: string;
  balance: number;
}

interface Order {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  method: 'MARKET' | 'LIMIT';
  price: number | null;
  quantity: number;
  filledQuantity: number;
  avgFilledPrice: number | null;
  status: string;
  createdAt: string;
}

interface Trade {
  id: number;
  buyOrderId: string;
  sellOrderId: string;
  price: string;
  quantity: number;
  executedAt: string;
  buyOrder: {
    id: string;
    userId: number;
    user: {
      username: string;
    };
  };
  sellOrder: {
    id: string;
    userId: number;
    user: {
      username: string;
    };
  };
}

interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

export interface BotStatus {
  isRunning: boolean;
  botCount: number;
  totalOrders: number;
  lastActivity?: string;
}

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

// Query Keys
export const queryKeys = {
  account: ['account'] as const,
  orders: ['orders'] as const,
  myOrders: ['orders', 'my'] as const,
  trades: ['trades'] as const,
  myTrades: ['trades', 'my'] as const,
  marketData: ['trades', 'market-data'] as const,
  positions: ['positions'] as const,
  position: (symbol: string) => ['positions', symbol] as const,
  botStatus: ['bot', 'status'] as const,
};

// Account Queries
export const useAccountInfo = () => {
  return useQuery<AxiosResponse<AccountInfo>, Error>({
    queryKey: queryKeys.account,
    queryFn: () => accountAPI.getAccountInfo(),
    staleTime: 30000, // 30秒内数据被认为是新鲜的
    gcTime: 300000, // 5分钟后清理缓存
  });
};

// Order Queries
export const useMyOrders = () => {
  return useQuery<AxiosResponse<Order[]>, Error>({
    queryKey: queryKeys.myOrders,
    queryFn: () => orderAPI.getMyOrders(),
    staleTime: 10000, // 10秒内数据被认为是新鲜的
    gcTime: 300000,
  });
};

// Trade Queries
export const useMyTrades = () => {
  return useQuery<AxiosResponse<Trade[]>, Error>({
    queryKey: queryKeys.myTrades,
    queryFn: () => tradeAPI.getMyTrades(),
    staleTime: 10000,
    gcTime: 300000,
  });
};

export const useAllTrades = () => {
  return useQuery<AxiosResponse<Trade[]>, Error>({
    queryKey: queryKeys.trades,
    queryFn: () => tradeAPI.getAllTrades(),
    staleTime: 5000, // 5秒内数据被认为是新鲜的
    gcTime: 300000,
  });
};

export const useMarketData = () => {
  return useQuery<AxiosResponse<MarketData>, Error>({
    queryKey: queryKeys.marketData,
    queryFn: () => tradeAPI.getMarketData(),
    staleTime: 1000, // 1秒内数据被认为是新鲜的
    gcTime: 60000, // 1分钟后清理缓存
  });
};

// Position Queries
export const useUserPositions = () => {
  return useQuery<AxiosResponse<Position[]>, Error>({
    queryKey: queryKeys.positions,
    queryFn: () => positionAPI.getUserPositions(),
    staleTime: 10000,
    gcTime: 300000,
  });
};

export const useUserPosition = (symbol: string) => {
  return useQuery<AxiosResponse<Position>, Error>({
    queryKey: queryKeys.position(symbol),
    queryFn: () => positionAPI.getUserPosition(symbol),
    staleTime: 10000,
    gcTime: 300000,
    enabled: !!symbol, // 只有当 symbol 存在时才执行查询
  });
};

// Bot Queries
export const useBotStatus = () => {
  return useQuery<AxiosResponse<BotStatus>, Error>({
    queryKey: queryKeys.botStatus,
    queryFn: () => botAPI.getBotStatus(),
    staleTime: 5000,
    gcTime: 60000,
    refetchInterval: 10000, // 每10秒自动刷新
  });
};

// Mutations
export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      authAPI.login(data),
    onSuccess: () => {
      // 登录成功后，刷新账户信息
      queryClient.invalidateQueries({ queryKey: queryKeys.account });
    },
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      authAPI.register(data),
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authAPI.logout(),
    onSuccess: () => {
      // 登出成功后，清除所有缓存
      queryClient.clear();
    },
  });
};

export const useCreateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      type: string;
      method?: string;
      price: number;
      quantity: number;
    }) => orderAPI.createOrder(data),
    onSuccess: () => {
      // 创建订单成功后，刷新相关数据
      queryClient.invalidateQueries({ queryKey: queryKeys.myOrders });
      queryClient.invalidateQueries({ queryKey: queryKeys.account });
      queryClient.invalidateQueries({ queryKey: queryKeys.positions });
    },
  });
};

export const useCancelOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => orderAPI.cancelOrder(id),
    onSuccess: () => {
      // 取消订单成功后，刷新订单列表
      queryClient.invalidateQueries({ queryKey: queryKeys.myOrders });
    },
  });
};

export const useStartBotTrading = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => botAPI.startBotTrading(),
    onSuccess: () => {
      // 启动机器人后，刷新机器人状态
      queryClient.invalidateQueries({ queryKey: queryKeys.botStatus });
    },
  });
};

export const useStopBotTrading = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => botAPI.stopBotTrading(),
    onSuccess: () => {
      // 停止机器人后，刷新机器人状态
      queryClient.invalidateQueries({ queryKey: queryKeys.botStatus });
    },
  });
};

// 刷新方法
export const useRefreshQueries = () => {
  const queryClient = useQueryClient();

  return {
    refreshAccount: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.account }),
    refreshOrders: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.myOrders }),
    refreshTrades: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.myTrades }),
    refreshPositions: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.positions }),
    refreshBotStatus: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.botStatus }),
    refreshMarketData: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.marketData }),
  };
};
