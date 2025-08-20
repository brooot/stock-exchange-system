/**
 * 图表数据处理逻辑
 */
import type { KlineData, ChartData } from '../types/klineTypes';
import { calculateMovingAverage } from './klineUtils';

/**
 * 初始化图表数据
 */
export const initializeChartData = (): ChartData => ({
  timestamps: [],
  klineData: [],
  volumeData: [],
  movingAverages: {
    ma5: [],
    ma10: [],
    ma20: [],
    ma30: [],
  },
});

/**
 * 处理K线数据并计算移动平均线
 * @param klineDataArray K线数据数组
 * @returns 处理后的图表数据
 */
export const processKlineData = (klineDataArray: KlineData[]): ChartData => {
  if (!klineDataArray || klineDataArray.length === 0) {
    return initializeChartData();
  }

  // 按时间戳排序
  const sortedData = [...klineDataArray].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  const timestamps: number[] = [];
  const klineData: [number, number, number, number][] = [];
  const volumeData: number[] = [];
  const closePrices: number[] = [];

  // 提取数据
  sortedData.forEach((item) => {
    timestamps.push(item.timestamp);
    klineData.push([item.open, item.close, item.low, item.high]);
    volumeData.push(item.volume);
    closePrices.push(item.close);
  });

  // 计算移动平均线
  const klineDataForMA = closePrices.map((price) => [0, price, 0, 0]); // [open, close, low, high]
  const ma5 = calculateMovingAverage(5, klineDataForMA);
  const ma10 = calculateMovingAverage(10, klineDataForMA);
  const ma20 = calculateMovingAverage(20, klineDataForMA);
  const ma30 = calculateMovingAverage(30, klineDataForMA);

  return {
    timestamps,
    klineData,
    volumeData,
    movingAverages: {
      ma5,
      ma10,
      ma20,
      ma30,
    },
  };
};

/**
 * 更新图表数据（添加新的K线数据）
 * @param currentData 当前图表数据
 * @param newKlineData 新的K线数据
 * @returns 更新后的图表数据
 */
export const updateChartData = (
  currentData: ChartData,
  newKlineData: KlineData
): ChartData => {
  const { timestamps, klineData, volumeData } = currentData;

  // 检查是否是更新现有数据点还是添加新数据点
  const existingIndex = timestamps.findIndex(
    (t) => t === newKlineData.timestamp
  );

  let newTimestamps: number[];
  let newKlineDataArray: [number, number, number, number][];
  let newVolumeData: number[];

  if (existingIndex !== -1) {
    // 更新现有数据点
    newTimestamps = [...timestamps];
    newKlineDataArray = [...klineData];
    newVolumeData = [...volumeData];

    newKlineDataArray[existingIndex] = [
      newKlineData.open,
      newKlineData.close,
      newKlineData.low,
      newKlineData.high,
    ];
    newVolumeData[existingIndex] = newKlineData.volume;
  } else {
    // 添加新数据点
    newTimestamps = [...timestamps, newKlineData.timestamp].sort(
      (a, b) => a - b
    );

    // 重新构建数据数组以保持时间顺序
    const allData = [
      ...timestamps.map((t, i) => ({
        timestamp: t,
        kline: klineData[i],
        volume: volumeData[i],
      })),
      {
        timestamp: newKlineData.timestamp,
        kline: [
          newKlineData.open,
          newKlineData.close,
          newKlineData.low,
          newKlineData.high,
        ] as [number, number, number, number],
        volume: newKlineData.volume,
      },
    ].sort((a, b) => a.timestamp - b.timestamp);

    newKlineDataArray = allData.map((item) => item.kline);
    newVolumeData = allData.map((item) => item.volume);
  }

  // 重新计算移动平均线
  const closePrices = newKlineDataArray.map((item) => item[1]); // close price is at index 1
  const klineDataForMA = closePrices.map((price) => [0, price, 0, 0]); // [open, close, low, high]
  const ma5 = calculateMovingAverage(5, klineDataForMA);
  const ma10 = calculateMovingAverage(10, klineDataForMA);
  const ma20 = calculateMovingAverage(20, klineDataForMA);
  const ma30 = calculateMovingAverage(30, klineDataForMA);

  return {
    timestamps: newTimestamps,
    klineData: newKlineDataArray,
    volumeData: newVolumeData,
    movingAverages: {
      ma5,
      ma10,
      ma20,
      ma30,
    },
  };
};

/**
 * 获取最新价格信息
 * @param chartData 图表数据
 * @returns 最新价格信息
 */
export const getLatestPriceInfo = (chartData: ChartData) => {
  const { klineData } = chartData;

  if (!klineData || klineData.length === 0) {
    return null;
  }

  const latestKline = klineData[klineData.length - 1];
  const [open, close, low, high] = latestKline;

  return {
    open,
    close,
    low,
    high,
    change: close - open,
    changePercent: ((close - open) / open) * 100,
  };
};

/**
 * 限制数据长度（用于性能优化）
 * @param chartData 图表数据
 * @param maxLength 最大长度
 * @returns 限制长度后的图表数据
 */
export const limitChartDataLength = (
  chartData: ChartData,
  maxLength: number
): ChartData => {
  const { timestamps, klineData, volumeData, movingAverages } = chartData;

  if (timestamps.length <= maxLength) {
    return chartData;
  }

  const startIndex = timestamps.length - maxLength;

  return {
    timestamps: timestamps.slice(startIndex),
    klineData: klineData.slice(startIndex),
    volumeData: volumeData.slice(startIndex),
    movingAverages: {
      ma5: movingAverages.ma5.slice(startIndex),
      ma10: movingAverages.ma10.slice(startIndex),
      ma20: movingAverages.ma20.slice(startIndex),
      ma30: movingAverages.ma30.slice(startIndex),
    },
  };
};
