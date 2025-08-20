'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useKlineData, useAvailableIntervals } from '../../hooks/useKlineQuery';
import { useKlineWebSocket } from '../../hooks/useKlineWebSocket';
import { generateChartOption, generateDataZoomOption } from '../../config/echartsConfig';
import { processKlineData, updateChartData, initializeChartData, getLatestPriceInfo } from '../../utils/chartDataProcessor';
import { DEFAULT_INTERVALS, getIntervalLabel } from '../../utils/klineUtils';
import type { KlineData, KLineChartProps, ChartData } from '../../types/klineTypes';

// 静态导入 ECharts 组件以支持 tree shaking
import * as echarts from 'echarts/core';
import {
  ToolboxComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent
} from 'echarts/components';
import {
  CandlestickChart,
  LineChart,
  BarChart
} from 'echarts/charts';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

// 注册 ECharts 组件
echarts.use([
  ToolboxComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  CandlestickChart,
  LineChart,
  BarChart,
  CanvasRenderer,
  UniversalTransition,
  MarkLineComponent,
  MarkPointComponent
]);

const KLineChart = React.memo(function KLineChart({
  symbol = 'AAPL',
  initialInterval = '1m',
  onIntervalChange
}: KLineChartProps) {
  // DOM引用和图表实例
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 组件状态
  const [isChartReady, setIsChartReady] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(initialInterval);
  const [chartData, setChartData] = useState<ChartData>(initializeChartData());


  // 使用 TanStack Query 获取K线数据
  const {
    data: queryKlineData,
    isLoading: queryIsLoading,
    error: queryError
  } = useKlineData({
    symbol,
    interval: currentInterval,
    limit: 1000,
    enabled: true
  });

  // 使用 TanStack Query 获取可用时间间隔
  const {
    data: availableIntervals,
    isLoading: intervalsLoading
  } = useAvailableIntervals();

  // 使用ref保存最新的currentInterval值，避免闭包问题
  const currentIntervalRef = useRef(currentInterval);

  // 更新ref值
  useEffect(() => {
    currentIntervalRef.current = currentInterval;
  }, [currentInterval]);

  // K线数据更新处理函数
  const handleKlineUpdate = useCallback((data: KlineData, interval: string) => {
    // 使用ref获取最新的currentInterval值
    const latestCurrentInterval = currentIntervalRef.current;
    if (interval === latestCurrentInterval) {
      setChartData(prevData => updateChartData(prevData, data));
    }
  }, []);

  // 使用WebSocket Hook
  const { isConnected } = useKlineWebSocket({
    symbol,
    currentInterval,
    onKlineUpdate: handleKlineUpdate
  });

  // 同步 TanStack Query 数据到本地状态
  useEffect(() => {
    if (queryKlineData && queryKlineData.length > 0) {
      const processedData = processKlineData(queryKlineData);
      setChartData(processedData);
    }
  }, [queryKlineData, currentInterval]);

  // 合并状态：使用 TanStack Query 的加载状态
  const isLoading = queryIsLoading;
  const error = queryError ? (queryError as Error).message : null;

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
    if (!chartRef.current) return;

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
  }, []);

  // 设置dataZoom事件监听器，确保能访问到最新的chartData
  useEffect(() => {
    if (!chartInstance.current || !isChartReady || !chartData || chartData.timestamps.length === 0) {
      return;
    }

    // 移除之前的事件监听器
    chartInstance.current.off('dataZoom');

    // 添加新的事件监听器
    chartInstance.current.on('dataZoom', (params: any) => {
      if (chartData && chartData.timestamps.length > 0) {
        const option = chartInstance.current?.getOption();
        const dataZoom = option?.dataZoom?.[0];
        if (dataZoom) {
          const totalLength = chartData.timestamps.length;
          const startPercent = dataZoom.start || 0;
          const endPercent = dataZoom.end || 100;

          const startIndex = Math.floor((startPercent / 100) * totalLength);
          const endIndex = Math.floor((endPercent / 100) * totalLength);
          const visibleCount = endIndex - startIndex;
          const endTimestamp = chartData.timestamps[endIndex - 1];

          currentDisplayState.current = {
            endTimestamp,
            visibleCount,
            startIndex,
            endIndex
          };
        }
      }
    });

    // 清理函数
    return () => {
      if (chartInstance.current) {
        chartInstance.current.off('dataZoom');
      }
    };
  }, [chartData, isChartReady]);

  // 生成ECharts配置选项
  const chartOption = useMemo(() => {
    if (!chartData || chartData.timestamps.length === 0) {
      return null;
    }

    // 获取当前价格（最新K线的收盘价）
    const latestPriceInfo = getLatestPriceInfo(chartData);
    const currentPrice = latestPriceInfo?.close;
    return generateChartOption(chartData, currentInterval, currentPrice, symbol);
  }, [chartData, currentInterval, symbol]);

  // 保存当前显示状态，用于时间周期切换时保持一致性
  const currentDisplayState = useRef<{
    endTimestamp?: number;
    visibleCount?: number;
    startIndex?: number;
    endIndex?: number;
  }>({});
  // 生成DataZoom配置选项
  const dataZoomOption = useMemo(() => {
    if (!chartData || chartData.timestamps.length === 0) {
      return null;
    }
    return generateDataZoomOption(
      chartData.timestamps.length,
      currentInterval,
      currentDisplayState.current,
      chartData.timestamps
    );
  }, [chartData, currentInterval]);

  // 初始化图表的dataZoom配置（只在图表首次准备好时设置）
  const isDataZoomInitialized = useRef(false);



  useEffect(() => {
    if (!chartInstance.current || !isChartReady || !dataZoomOption || isDataZoomInitialized.current) return;

    chartInstance.current.setOption(dataZoomOption, {
      notMerge: false,
      lazyUpdate: true,
      silent: false
    });

    isDataZoomInitialized.current = true;
  }, [isChartReady, dataZoomOption]);

  // 重置dataZoom初始化状态当时间周期改变时
  useEffect(() => {
    isDataZoomInitialized.current = false;
    // 注意：不清空currentDisplayState，保持显示状态以实现一致性
  }, [currentInterval]);

  // 更新图表数据和配置（不包含dataZoom）
  useEffect(() => {
    if (!chartInstance.current || !isChartReady || !chartOption) return;

    // 清除之前的更新定时器
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // 使用防抖机制，避免频繁更新
    updateTimeoutRef.current = setTimeout(() => {
      if (!chartInstance.current || !chartOption) return;

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
  }, [chartOption, isChartReady]);



  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* 图表标题和时间周期选择器 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">价格K线图</h2>

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
      {isLoading && (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">加载中...</span>
        </div>
      )}

      {/* ECharts图表容器 */}
      <div
        key="KLineChart"
        ref={chartRef}
        className={`w-full h-96 ${isLoading ? 'hidden' : ''}`}
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
      {!isLoading && chartData.timestamps.length === 0 && (
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
