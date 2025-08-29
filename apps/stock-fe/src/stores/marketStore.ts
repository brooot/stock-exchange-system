import { create } from 'zustand';

export interface MarketData {
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

export interface TradeData {
  symbol: string;
  price: number;
  quantity: number;
  timestamp: Date;
  tradeId: string;
  batchSize?: number;
}

interface MarketState {
  marketData: MarketData | null;
  lastTrade: TradeData | null;
  isConnected: boolean;
  setMarketData: (data: MarketData | null) => void;
  setLastTrade: (trade: TradeData | null) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const useMarketStore = create<MarketState>()((set) => ({
  marketData: null,
  lastTrade: null,
  isConnected: false,
  setMarketData: (data) => set({ marketData: data }),
  setLastTrade: (trade) => set({ lastTrade: trade }),
  setConnected: (connected) => set({ isConnected: connected }),
  reset: () => set({ marketData: null, lastTrade: null, isConnected: false }),
}));