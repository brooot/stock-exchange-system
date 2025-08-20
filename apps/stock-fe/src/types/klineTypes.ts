/**
 * K线图相关类型定义
 */

export interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  interval: string;
}

export interface KlineUpdateEvent {
  interval: string;
  data: KlineData;
  isNewKline: boolean;
}

export interface PriceUpdateEvent {
  symbol: string;
  price: number;
  volume: number;
  timestamp: Date;
  tradeId: number;
}

export interface KLineChartProps {
  symbol?: string;
  initialInterval?: string;
  onIntervalChange?: (interval: string) => void;
}

export interface ChartData {
  timestamps: number[];
  klineData: [number, number, number, number][];
  volumeData: number[];
  movingAverages: {
    ma5: (number | string)[];
    ma10: (number | string)[];
    ma20: (number | string)[];
    ma30: (number | string)[];
  };
}

export interface IntervalOption {
  value: string;
  label: string;
}