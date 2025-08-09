/**
 * K线图相关工具函数
 */

// 默认时间间隔配置
export const DEFAULT_INTERVALS = [
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '1h', label: '1小时' },
  { value: '1d', label: '1天' },
];

// K线图颜色配置
export const CHART_COLORS = {
  up: '#00da3c', // 上涨颜色（绿色）
  down: '#ec0000', // 下跌颜色（红色）
} as const;

/**
 * 计算移动平均线
 * @param period 周期天数
 * @param klineData K线数据数组，格式为 [open, close, low, high]
 * @returns 移动平均线数据数组
 */
export function calculateMovingAverage(
  period: number,
  klineData: number[][]
): (number | string)[] {
  const result: (number | string)[] = [];

  for (let i = 0; i < klineData.length; i++) {
    if (i < period) {
      result.push('-');
      continue;
    }

    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += klineData[i - j][1]; // 使用收盘价计算
    }
    result.push(Number((sum / period).toFixed(3)));
  }

  return result;
}

/**
 * 获取时间间隔的中文标签
 * @param interval 时间间隔值
 * @returns 对应的中文标签
 */
export const getIntervalLabel = (interval: string): string => {
  const INTERVAL_LABELS: Record<string, string> = {
    '1m': '1分钟',
    '5m': '5分钟',
    '15m': '15分钟',
    '1h': '1小时',
    '1d': '1天',
  };
  return INTERVAL_LABELS[interval] || interval;
};

/**
 * 获取时间间隔对应的毫秒数
 * @param interval 时间间隔值
 * @returns 对应的毫秒数
 */
export const getIntervalInMs = (interval: string): number => {
  const intervalMap: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return intervalMap[interval] || 60 * 1000;
};

/**
 * 格式化时间戳为显示文本
 * @param timestamp 时间戳
 * @param interval 时间间隔
 * @returns 格式化后的时间文本
 */
export const formatTimestamp = (
  timestamp: number,
  interval: string
): string => {
  const date = new Date(timestamp);
  if (interval === '1d') {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  } else {
    return `${date.getHours().toString().padStart(2, '0')}:${date
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
  }
};
