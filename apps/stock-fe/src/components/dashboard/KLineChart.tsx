'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import {
  ToolboxComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  VisualMapComponent
} from 'echarts/components';
import { CandlestickChart, LineChart, BarChart } from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

// 注册必要的组件
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

const upColor = '#00da3c';
const downColor = '#ec0000';

// 计算移动平均线
function calculateMA(dayCount: number, data: number[][]): (number | string)[] {
  const result: (number | string)[] = [];
  for (let i = 0, len = data.length; i < len; i++) {
    if (i < dayCount) {
      result.push('-');
      continue;
    }
    let sum = 0;
    for (let j = 0; j < dayCount; j++) {
      sum += data[i - j][1]; // 收盘价
    }
    result.push(+(sum / dayCount).toFixed(3));
  }
  return result;
}

const getIntervalLabel = (value: string): string => {
  const labelMap: Record<string, string> = {
    '1m': '1分钟',
    '5m': '5分钟',
    '15m': '15分钟',
    '1h': '1小时',
    '1d': '1天',
  };
  return labelMap[value] || value;
};

export default function KLineChart({
  data,
  interval,
  onIntervalChange,
  isLoading = false,
  getSupportedIntervals
}: KLineChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [isChartReady, setIsChartReady] = useState(false);
  const [intervals, setIntervals] = useState(DEFAULT_INTERVALS);
  const [intervalsLoading, setIntervalsLoading] = useState(false);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 获取支持的时间周期
  useEffect(() => {
    const fetchIntervals = async () => {
      if (getSupportedIntervals) {
        // 如果传入了获取方法，则调用它
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
          // 保持使用默认值
        } finally {
          setIntervalsLoading(false);
        }
      }
    };

    fetchIntervals();
  }, [getSupportedIntervals]);

  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return;

    // 销毁现有图表实例
    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }

    // 延迟创建图表实例，确保DOM完全准备好
    const timer = setTimeout(() => {
      if (chartRef.current) {
        chartInstance.current = echarts.init(chartRef.current);
        // 确保图表正确计算容器尺寸
        setTimeout(() => {
          chartInstance.current?.resize();
          setIsChartReady(true);
        }, 50);
      }
    }, 100);

    // 监听窗口大小变化
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
      setIsChartReady(false);
    };
  }, []);

  // 使用 useMemo 缓存处理后的数据，避免重复计算
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        categoryData: [],
        klineData: [],
        volumeData: [],
        ma5: [],
        ma10: [],
        ma20: [],
        ma30: []
      };
    }

    // 提取时间戳数据
    const categoryData = data.map(item => item.timestamp);

    // 处理K线数据 - 转换为ECharts candlestick格式 [open, close, low, high]
    const klineData = data.map(item => [
      item.open,
      item.close,
      item.low,
      item.high
    ]);

    // 处理成交量数据 - 转换为ECharts格式 [index, volume, direction]
    const volumeData = data.map((item, index) => [
      index,
      item.volume,
      item.close >= item.open ? 1 : -1
    ]);

    // 计算移动平均线 - 使用收盘价
    const ma5 = calculateMA(5, klineData);
    const ma10 = calculateMA(10, klineData);
    const ma20 = calculateMA(20, klineData);
    const ma30 = calculateMA(30, klineData);

    return {
      categoryData,
      klineData,
      volumeData,
      ma5,
      ma10,
      ma20,
      ma30
    };
  }, [data]);

  // 更新图表数据
  useEffect(() => {
    if (!chartInstance.current || !isChartReady || !chartData) return;

    // 清除之前的更新定时器
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // 使用防抖机制，避免频繁更新
    updateTimeoutRef.current = setTimeout(() => {
      if (!chartInstance.current || !chartData) return;

      // 清除之前的图表内容，防止重叠
      chartInstance.current.clear();

      const { categoryData, klineData, volumeData, ma5, ma10, ma20, ma30 } = chartData;

      const option: EChartsCoreOption = {
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
            data: categoryData.map(timestamp => {
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
            data: categoryData.map(timestamp => {
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
              color: downColor
            },
            {
              value: -1,
              color: upColor
            }
          ]
        },
        series: [
          {
            name: 'K线',
            type: 'candlestick',
            data: klineData,
            itemStyle: {
              color: upColor,
              color0: downColor,
              borderColor: upColor,
              borderColor0: downColor
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

      // 使用 clear() + setOption() 确保完全重新渲染，避免重叠
      chartInstance.current.setOption(option, { notMerge: true, lazyUpdate: false, silent: true });
    }, 50); // 50ms 防抖延迟

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [chartData, interval, isChartReady]);

  // 增量更新最后一根K线
  const updateLastKline = useCallback((newKlineData: KlineData) => {
    if (!chartInstance.current || !data.length || !isChartReady) return;

    const lastIndex = data.length - 1;
    const lastTimestamp = data[lastIndex].timestamp;

    // 如果是同一时间周期的数据，更新最后一根K线
    if (newKlineData.timestamp === lastTimestamp) {
      const updatedData = [...data];
      updatedData[lastIndex] = newKlineData;

      // 重新计算数据
      const newKlineData_formatted = updatedData.map(item => [
        item.open,
        item.close,
        item.low,
        item.high
      ]);

      const newVolumeData = updatedData.map((item, index) => [
        index,
        item.volume,
        item.close >= item.open ? 1 : -1
      ]);

      const newMA5 = calculateMA(5, newKlineData_formatted);
      const newMA10 = calculateMA(10, newKlineData_formatted);
      const newMA20 = calculateMA(20, newKlineData_formatted);
      const newMA30 = calculateMA(30, newKlineData_formatted);

      // 使用 replaceMerge 进行安全的增量更新
      chartInstance.current.setOption({
        series: [
          {
            data: newKlineData_formatted
          },
          {
            data: newMA5
          },
          {
            data: newMA10
          },
          {
            data: newMA20
          },
          {
            data: newMA30
          },
          {
            data: newVolumeData
          }
        ]
      }, { replaceMerge: ['series'], lazyUpdate: true, silent: true });
    }
  }, [data, isChartReady]);

  // 暴露更新方法给父组件
  useEffect(() => {
    if (chartRef.current) {
      (chartRef.current as any).updateLastKline = updateLastKline;
    }
  }, [updateLastKline]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">K线图</h2>

        {/* 时间周期选择器 */}
        <div className="flex space-x-2">
          {intervalsLoading ? (
            <div className="text-sm text-gray-500">加载时间周期...</div>
          ) : (
            intervals.map((item) => (
              <button
                key={item.value}
                onClick={() => onIntervalChange(item.value)}
                className={`px-3 py-1 text-sm rounded ${interval === item.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading && (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">加载中...</span>
        </div>
      )}

      {/* 图表容器 */}
      <div
        ref={chartRef}
        className={`w-full h-96 ${isLoading ? 'hidden' : ''}`}
        style={{ minHeight: '400px' }}
      />

      {/* 无数据状态 */}
      {!isLoading && data.length === 0 && (
        <div className="flex items-center justify-center h-96 text-gray-500">
          <div className="text-center">
            <div className="text-4xl mb-2">📈</div>
            <div>暂无K线数据</div>
            <div className="text-sm mt-1">等待交易数据生成...</div>
          </div>
        </div>
      )}
    </div>
  );
}
