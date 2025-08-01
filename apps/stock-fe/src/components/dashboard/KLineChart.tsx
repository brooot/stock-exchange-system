'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

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

interface KLineChartProps {
  data: KlineData[];
  interval: string;
  onIntervalChange: (interval: string) => void;
  isLoading?: boolean;
  getSupportedIntervals?: () => Promise<string[]>;
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

export default function KLineChart({
  data,
  interval,
  onIntervalChange,
  isLoading = false,
  getSupportedIntervals
}: KLineChartProps) {
  // DOM引用和图表实例
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 组件状态
  const [isChartReady, setIsChartReady] = useState(false);
  const [intervals, setIntervals] = useState(DEFAULT_INTERVALS);
  const [intervalsLoading, setIntervalsLoading] = useState(false);
  const [echartsLoaded, setEchartsLoaded] = useState(false);

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

  // 获取支持的时间周期列表
  useEffect(() => {
    const fetchSupportedIntervals = async () => {
      if (!getSupportedIntervals) return;

      try {
        setIntervalsLoading(true);
        const supportedList = await getSupportedIntervals();
        const intervalOptions = supportedList.map(value => ({
          value,
          label: getIntervalLabel(value)
        }));
        setIntervals(intervalOptions);
      } catch (error) {
        console.error('获取支持的时间周期失败:', error);
        // 发生错误时保持使用默认值
      } finally {
        setIntervalsLoading(false);
      }
    };

    fetchSupportedIntervals();
  }, [getSupportedIntervals]);

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
    if (!data || data.length === 0) {
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
    const timestamps = data.map(item => item.timestamp);

    // 转换K线数据为ECharts candlestick格式 [open, close, low, high]
    const klineData = data.map(item => [
      item.open,
      item.close,
      item.low,
      item.high
    ]);

    // 转换成交量数据为ECharts格式 [index, volume, direction]
    const volumeData = data.map((item, index) => [
      index,
      item.volume,
      item.close >= item.open ? 1 : -1  // 1表示上涨，-1表示下跌
    ]);

    // 计算各周期移动平均线
    const movingAverages = {
      ma5: calculateMovingAverage(5, klineData),
      ma10: calculateMovingAverage(10, klineData),
      ma20: calculateMovingAverage(20, klineData),
      ma30: calculateMovingAverage(30, klineData)
    };

    return {
      timestamps,
      klineData,
      volumeData,
      movingAverages
    };
  }, [data]);

  // 更新图表数据和配置
  useEffect(() => {
    if (!chartInstance.current || !isChartReady || !chartData) return;

    // 清除之前的更新定时器
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // 使用防抖机制，避免频繁更新
    updateTimeoutRef.current = setTimeout(() => {
      if (!chartInstance.current || !chartData) return;

      // 清除之前的图表内容，防止数据重叠
      chartInstance.current.clear();

      const { timestamps=[], klineData, volumeData, movingAverages } = chartData;
      const { ma5, ma10, ma20, ma30 } = movingAverages;

      // 构建ECharts配置选项
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
              if (interval === '1d') {
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
              if (interval === '1d') {
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
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: [0, 1],
            start: data.length <= 50 ? 0 : Math.max(0, 100 - (100 / data.length) * 50),
            end: 100
          },
          {
            show: true,
            xAxisIndex: [0, 1],
            type: 'slider',
            top: '85%',
            start: data.length <= 50 ? 0 : Math.max(0, 100 - (100 / data.length) * 50),
            end: 100
          }
        ],
        visualMap: {
          show: false,
          seriesIndex: 5,
          dimension: 2,
          pieces: [
            {
              value: 1,
              color: CHART_COLORS.down
            },
            {
              value: -1,
              color: CHART_COLORS.up
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

      // 使用clear() + setOption()确保完全重新渲染，避免数据重叠
      chartInstance.current.setOption(chartOption, {
        notMerge: true,
        lazyUpdate: false,
        silent: true
      });
    }, 50); // 50ms防抖延迟

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [chartData, interval, isChartReady]);

  /**
   * 增量更新最后一根K线数据
   * @param newKlineData 新的K线数据
   */
  const updateLastKline = useCallback((newKlineData: KlineData) => {
    if (!chartInstance.current || !data.length || !isChartReady) return;

    const lastIndex = data.length - 1;
    const lastTimestamp = data[lastIndex].timestamp;

    // 只有当新数据与最后一根K线时间戳相同时才进行更新
    if (newKlineData.timestamp === lastTimestamp) {
      const updatedData = [...data];
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
  }, [data, isChartReady]);

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
                onClick={() => onIntervalChange(intervalOption.value)}
                className={`px-3 py-1 text-sm rounded transition-colors ${interval === intervalOption.value
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
        ref={chartRef}
        className={`w-full h-96 ${(isLoading || !echartsLoaded) ? 'hidden' : ''}`}
        style={{ minHeight: '400px' }}
      />

      {/* 无数据状态提示 */}
      {!isLoading && echartsLoaded && data.length === 0 && (
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
}
