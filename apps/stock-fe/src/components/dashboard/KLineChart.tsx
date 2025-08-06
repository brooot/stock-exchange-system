'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useKlineData, useAvailableIntervals } from '../../hooks/useKlineQuery';

// 动态导入 echarts 以避免 SSR 问题
let echarts: any = null;

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

interface KLineChartProps {
  symbol?: string;
  initialInterval?: string;
  onIntervalChange?: (interval: string) => void;
}

const DEFAULT_INTERVALS = [
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '1h', label: '1小时' },
  { value: '1d', label: '1天' },
];

// K线图颜色配置
const CHART_COLORS = {
  up: '#00da3c',    // 上涨颜色（绿色）
  down: '#ec0000'   // 下跌颜色（红色）
} as const;

/**
 * 计算移动平均线
 * @param period 周期天数
 * @param klineData K线数据数组，格式为 [open, close, low, high]
 * @returns 移动平均线数据数组
 */
function calculateMovingAverage(period: number, klineData: number[][]): (number | string)[] {
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
const getIntervalLabel = (interval: string): string => {
  const INTERVAL_LABELS: Record<string, string> = {
    '1m': '1分钟',
    '5m': '5分钟',
    '15m': '15分钟',
    '1h': '1小时',
    '1d': '1天',
  };
  return INTERVAL_LABELS[interval] || interval;
};

const KLineChart = React.memo(function KLineChart({
  symbol = 'AAPL',
  initialInterval = '1m',
  onIntervalChange
}: KLineChartProps) {
  // DOM引用和图表实例
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Map<string, KlineData>>(new Map());



  // 组件状态
  const [isChartReady, setIsChartReady] = useState(false);
  const [echartsLoaded, setEchartsLoaded] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(initialInterval);
  const [klineData, setKlineData] = useState<Record<string, KlineData[]>>({});
  const [isConnected, setIsConnected] = useState(false);

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

  // 动态加载ECharts库和组件
  useEffect(() => {
    const loadECharts = async () => {
      if (typeof window === 'undefined' || echarts) {
        if (echarts) setEchartsLoaded(true);
        return;
      }

      try {
        const [
          echartsCore,
          components,
          charts,
          features,
          renderers
        ] = await Promise.all([
          import('echarts/core'),
          import('echarts/components'),
          import('echarts/charts'),
          import('echarts/features'),
          import('echarts/renderers')
        ]);

        echarts = echartsCore;

        // 解构所需组件
        const {
          ToolboxComponent,
          TooltipComponent,
          GridComponent,
          LegendComponent,
          DataZoomComponent,
          VisualMapComponent
        } = components;

        const { CandlestickChart, LineChart, BarChart } = charts;
        const { UniversalTransition } = features;
        const { CanvasRenderer } = renderers;

        // 注册ECharts组件
        echarts.use([
          ToolboxComponent,
          TooltipComponent,
          GridComponent,
          LegendComponent,
          DataZoomComponent,
          VisualMapComponent,
          CandlestickChart,
          LineChart,
          BarChart,
          CanvasRenderer,
          UniversalTransition
        ]);

        setEchartsLoaded(true);
      } catch (error) {
        console.error('Failed to load ECharts:', error);
      }
    };

    loadECharts();
  }, []);

  // 使用 TanStack Query 获取K线数据
  const {
    data: queryKlineData,
    isLoading: queryIsLoading,
    error: queryError
  } = useKlineData({
    symbol,
    interval: currentInterval,
    limit: 100,
    enabled: true
  });

  // 使用 TanStack Query 获取可用时间间隔
  const {
    data: availableIntervals,
    isLoading: intervalsLoading
  } = useAvailableIntervals();

  // 获取刷新方法（暂时未使用，如需强制刷新可取消注释）
  // const { refreshKlineData } = useRefreshKlineData();

  // 手动刷新K线数据的方法现在通过 TanStack Query 处理
  // 如需强制刷新数据可使用 refreshKlineData

  // 同步 TanStack Query 数据到本地状态
  useEffect(() => {
    if (queryKlineData && queryKlineData.length > 0) {
      setKlineData(prev => ({
        ...prev,
        [currentInterval]: queryKlineData
      }));
    }
  }, [queryKlineData, currentInterval]);

  // 合并状态：使用 TanStack Query 的加载状态
  const isLoading = queryIsLoading;
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

  // 获取时间间隔对应的毫秒数
  const getIntervalInMs = useCallback((interval: string): number => {
    const intervalMap: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return intervalMap[interval] || 60 * 1000;
  }, []);

  // 处理价格更新事件（用于实时价格显示）
  const handlePriceUpdate = useCallback((priceUpdate: PriceUpdateEvent) => {
    const { symbol: updateSymbol, price, volume, timestamp } = priceUpdate;

    // 通过ref获取最新的symbol和currentInterval值
    const currentSymbol = symbolRef.current;
    const currentIntervalValue = currentIntervalRef.current;

    // 只处理当前股票的价格更新
    if (updateSymbol !== currentSymbol) return;

    // 更新当前时间周期的最后一根K线数据
    setKlineData(prevData => {
      const newData = { ...prevData };
      const currentData = newData[currentIntervalValue] || [];

      if (currentData.length === 0) return prevData;

      // 获取最后一根K线
      const lastKline = { ...currentData[currentData.length - 1] };
      const updateTime = new Date(timestamp).getTime();

      // 判断是否应该更新最后一根K线（基于时间间隔）
      const intervalMs = getIntervalInMs(currentIntervalValue);
      const klineStartTime = Math.floor(lastKline.timestamp / intervalMs) * intervalMs;
      const currentKlineEndTime = klineStartTime + intervalMs;

      // 如果价格更新时间在当前K线时间范围内，则更新最后一根K线
      if (updateTime >= klineStartTime && updateTime < currentKlineEndTime) {
        // 更新最后一根K线的数据
        lastKline.close = price;
        lastKline.high = Math.max(lastKline.high, price);
        lastKline.low = Math.min(lastKline.low, price);
        lastKline.volume += volume; // 累加成交量

        // 替换最后一根K线
        const updatedData = [...currentData];
        updatedData[updatedData.length - 1] = lastKline;
        newData[currentIntervalValue] = updatedData;
      }

      return newData;
    });
  }, [getIntervalInMs]);



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

  // TanStack Query 会自动处理时间周期变化时的数据获取

  // 处理可用时间间隔数据
  const intervals = useMemo(() => {
    if (availableIntervals && Array.isArray(availableIntervals.intervals)) {
      return availableIntervals.intervals.map((value: string) => ({
        value,
        label: getIntervalLabel(value)
      }));
    }
    return DEFAULT_INTERVALS;
  }, [availableIntervals]);

  // 切换时间周期
  const changeInterval = useCallback((newInterval: string) => {
    setCurrentInterval(newInterval);
    onIntervalChange?.(newInterval);

    // TanStack Query 会自动处理数据获取
    // 如果需要强制刷新，可以调用 refreshKlineData
  }, [onIntervalChange]);

  // 初始化ECharts图表实例
  useEffect(() => {
    if (!chartRef.current || !echarts || !echartsLoaded) return;

    // 清理现有图表实例
    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }

    // 延迟创建图表实例，确保DOM完全准备
    const initTimer = setTimeout(() => {
      if (chartRef.current && echarts) {
        chartInstance.current = echarts.init(chartRef.current);

        // 确保图表正确计算容器尺寸
        setTimeout(() => {
          chartInstance.current?.resize();
          setIsChartReady(true);
        }, 50);
      }
    }, 100);

    // 监听窗口大小变化事件
    const handleWindowResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleWindowResize);

    // 清理函数
    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', handleWindowResize);

      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }

      setIsChartReady(false);
    };
  }, [echartsLoaded]);

  // 使用useMemo缓存处理后的图表数据，避免重复计算
  const chartData = useMemo(() => {
    const currentData = klineData[currentInterval] || [];

    if (currentData.length === 0) {
      return {
        timestamps: [],
        klineData: [],
        volumeData: [],
        movingAverages: {
          ma5: [],
          ma10: [],
          ma20: [],
          ma30: []
        }
      };
    }

    // 提取时间戳数据
    const timestamps = currentData.map(item => item.timestamp);

    // 转换K线数据为ECharts candlestick格式 [open, close, low, high]
    const klineDataArray = currentData.map(item => [
      item.open,
      item.close,
      item.low,
      item.high
    ]);

    // 转换成交量数据为ECharts格式 [index, volume, direction]
    const volumeData = currentData.map((item, index) => [
      index,
      item.volume,
      item.close >= item.open ? 1 : -1  // 1表示上涨，-1表示下跌
    ]);

    // 计算各周期移动平均线
    const movingAverages = {
      ma5: calculateMovingAverage(5, klineDataArray),
      ma10: calculateMovingAverage(10, klineDataArray),
      ma20: calculateMovingAverage(20, klineDataArray),
      ma30: calculateMovingAverage(30, klineDataArray)
    };

    return {
      timestamps,
      klineData: klineDataArray,
      volumeData,
      movingAverages
    };
  }, [klineData, currentInterval]);

  // 初始化图表的dataZoom配置（只在图表首次准备好时设置）
  const isDataZoomInitialized = useRef(false);

  useEffect(() => {
    if (!chartInstance.current || !isChartReady || !chartData || isDataZoomInitialized.current) return;

    const { klineData } = chartData;
    const currentData = klineData || [];

    if (currentData.length === 0) return;

    // 设置初始dataZoom配置
    const dataZoomOption = {
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0, 1],
          start: currentData.length <= 50 ? 0 : Math.max(0, 100 - (100 / currentData.length) * 50),
          end: 100
        },
        {
          show: true,
          xAxisIndex: [0, 1],
          type: 'slider',
          top: '85%',
          start: currentData.length <= 50 ? 0 : Math.max(0, 100 - (100 / currentData.length) * 50),
          end: 100
        }
      ]
    };

    chartInstance.current.setOption(dataZoomOption, {
      notMerge: false,
      lazyUpdate: true,
      silent: false
    });

    isDataZoomInitialized.current = true;
  }, [isChartReady, chartData]);

  // 重置dataZoom初始化状态当时间周期改变时
  useEffect(() => {
    isDataZoomInitialized.current = false;
  }, [currentInterval]);

  // 更新图表数据和配置（不包含dataZoom）
  useEffect(() => {
    if (!chartInstance.current || !isChartReady || !chartData) return;

    // 清除之前的更新定时器
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // 使用防抖机制，避免频繁更新
    updateTimeoutRef.current = setTimeout(() => {
      if (!chartInstance.current || !chartData) return;

      const { timestamps = [], klineData, volumeData, movingAverages } = chartData;
      const { ma5, ma10, ma20, ma30 } = movingAverages;

      // 构建ECharts配置选项（不包含dataZoom）
      const chartOption: any = {
        animation: false,
        legend: {
          bottom: 10,
          left: 'center',
          data: ['K线', 'MA5', 'MA10', 'MA20', 'MA30']
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross'
          },
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 10,
          textStyle: {
            color: '#000'
          },
          position: function (pos: any, params: any, el: any, elRect: any, size: any) {
            const obj: any = {
              top: 10
            };
            obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 30;
            return obj;
          }
        },
        axisPointer: {
          link: [
            {
              xAxisIndex: 'all'
            }
          ],
          label: {
            backgroundColor: '#777'
          }
        },
        grid: [
          {
            left: '10%',
            right: '8%',
            height: '50%'
          },
          {
            left: '10%',
            right: '8%',
            top: '63%',
            height: '16%'
          }
        ],
        xAxis: [
          {
            type: 'category',
            data: timestamps.map((timestamp: number) => {
              const date = new Date(timestamp);
              if (currentInterval === '1d') {
                return `${date.getMonth() + 1}/${date.getDate()}`;
              } else {
                return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
              }
            }),
            boundaryGap: false,
            axisLine: { onZero: false },
            splitLine: { show: false },
            min: 'dataMin',
            max: 'dataMax',
            axisPointer: {
              z: 100
            }
          },
          {
            type: 'category',
            gridIndex: 1,
            data: timestamps.map((timestamp: number) => {
              const date = new Date(timestamp);
              if (currentInterval === '1d') {
                return `${date.getMonth() + 1}/${date.getDate()}`;
              } else {
                return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
              }
            }),
            boundaryGap: false,
            axisLine: { onZero: false },
            axisTick: { show: false },
            splitLine: { show: false },
            axisLabel: { show: false },
            min: 'dataMin',
            max: 'dataMax'
          }
        ],
        yAxis: [
          {
            scale: true,
            splitArea: {
              show: true
            }
          },
          {
            scale: true,
            gridIndex: 1,
            splitNumber: 2,
            axisLabel: { show: false },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: { show: false }
          }
        ],
        visualMap: {
          show: false,
          seriesIndex: 5,
          dimension: 2,
          pieces: [
            {
              value: 1,
              color: CHART_COLORS.up
            },
            {
              value: -1,
              color: CHART_COLORS.down
            }
          ]
        },
        series: [
          {
            name: 'K线',
            type: 'candlestick',
            data: klineData,
            itemStyle: {
              color: CHART_COLORS.up,
              color0: CHART_COLORS.down,
              borderColor: CHART_COLORS.up,
              borderColor0: CHART_COLORS.down
            }
          },
          {
            name: 'MA5',
            type: 'line',
            data: ma5,
            smooth: true,
            lineStyle: {
              opacity: 0.5,
              width: 1
            },
            showSymbol: false
          },
          {
            name: 'MA10',
            type: 'line',
            data: ma10,
            smooth: true,
            lineStyle: {
              opacity: 0.5,
              width: 1
            },
            showSymbol: false
          },
          {
            name: 'MA20',
            type: 'line',
            data: ma20,
            smooth: true,
            lineStyle: {
              opacity: 0.5,
              width: 1
            },
            showSymbol: false
          },
          {
            name: 'MA30',
            type: 'line',
            data: ma30,
            smooth: true,
            lineStyle: {
              opacity: 0.5,
              width: 1
            },
            showSymbol: false
          },
          {
            name: '成交量',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: volumeData
          }
        ]
      };

      // 使用merge模式更新图表，保持交互状态
      chartInstance.current.setOption(chartOption, {
        notMerge: false,
        lazyUpdate: true,
        silent: false
      });
    }, 50); // 50ms防抖延迟

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [chartData, currentInterval, isChartReady]);

  /**
   * 增量更新最后一根K线数据
   * @param newKlineData 新的K线数据
   */
  const updateLastKline = useCallback((newKlineData: KlineData) => {
    const currentData = klineData[currentInterval] || [];
    if (!chartInstance.current || !currentData.length || !isChartReady) return;

    const lastIndex = currentData.length - 1;
    const lastTimestamp = currentData[lastIndex].timestamp;

    // 只有当新数据与最后一根K线时间戳相同时才进行更新
    if (newKlineData.timestamp === lastTimestamp) {
      const updatedData = [...currentData];
      updatedData[lastIndex] = newKlineData;

      // 重新格式化K线数据
      const formattedKlineData = updatedData.map(item => [
        item.open,
        item.close,
        item.low,
        item.high
      ]);

      // 重新格式化成交量数据
      const formattedVolumeData = updatedData.map((item, index) => [
        index,
        item.volume,
        item.close >= item.open ? 1 : -1
      ]);

      // 重新计算移动平均线
      const updatedMA5 = calculateMovingAverage(5, formattedKlineData);
      const updatedMA10 = calculateMovingAverage(10, formattedKlineData);
      const updatedMA20 = calculateMovingAverage(20, formattedKlineData);
      const updatedMA30 = calculateMovingAverage(30, formattedKlineData);

      // 使用replaceMerge进行安全的增量更新
      chartInstance.current.setOption({
        series: [
          { data: formattedKlineData },
          { data: updatedMA5 },
          { data: updatedMA10 },
          { data: updatedMA20 },
          { data: updatedMA30 },
          { data: formattedVolumeData }
        ]
      }, {
        replaceMerge: ['series'],
        lazyUpdate: true,
        silent: true
      });
    }
  }, [klineData, currentInterval, isChartReady]);

  // 将更新方法暴露给父组件使用
  useEffect(() => {
    if (chartRef.current) {
      (chartRef.current as any).updateLastKline = updateLastKline;
    }
  }, [updateLastKline]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* 图表标题和时间周期选择器 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">K线图</h2>

        <div className="flex space-x-2">
          {intervalsLoading ? (
            <div className="text-sm text-gray-500">加载时间周期...</div>
          ) : (
            intervals.map((intervalOption) => (
              <button
                key={intervalOption.value}
                onClick={() => changeInterval(intervalOption.value)}
                className={`px-3 py-1 text-sm rounded transition-colors ${currentInterval === intervalOption.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {intervalOption.label}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 图表加载状态 */}
      {(isLoading || !echartsLoaded) && (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">
            {!echartsLoaded ? '初始化图表...' : '加载中...'}
          </span>
        </div>
      )}

      {/* ECharts图表容器 */}
      <div
        key="KLineChart"
        ref={chartRef}
        className={`w-full h-96 ${(isLoading || !echartsLoaded) ? 'hidden' : ''}`}
        style={{ minHeight: '400px' }}
      />

      {/* 连接状态指示器 */}
      {!isConnected && (
        <div className="mb-2 text-sm text-orange-600">
          ⚠️ WebSocket连接断开，实时数据可能不准确
        </div>
      )}

      {/* 错误状态提示 */}
      {error && (
        <div className="mb-2 text-sm text-red-600">
          ❌ {error}
        </div>
      )}

      {/* 无数据状态提示 */}
      {!isLoading && echartsLoaded && (klineData[currentInterval] || []).length === 0 && (
        <div className="flex items-center justify-center h-96 text-gray-500">
          <div className="text-center">
            <div className="text-4xl mb-2">📈</div>
            <div className="text-base">暂无K线数据</div>
            <div className="text-sm mt-1 text-gray-400">等待交易数据生成...</div>
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数，优化React.memo性能
  return (
    prevProps.symbol === nextProps.symbol &&
    prevProps.initialInterval === nextProps.initialInterval &&
    prevProps.onIntervalChange === nextProps.onIntervalChange
  );
});

export default KLineChart;
