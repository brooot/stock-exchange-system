/**
 * ECharts配置选项
 */
import { CHART_COLORS, formatTimestamp } from '../utils/klineUtils';
import type { ChartData } from '../types/klineTypes';

/**
 * 生成ECharts配置选项
 * @param chartData 图表数据
 * @param currentInterval 当前时间间隔
 * @param currentPrice 当前价格（可选）
 * @returns ECharts配置对象
 */
export const generateChartOption = (
  chartData: ChartData,
  currentInterval: string,
  currentPrice?: number,
  stockSymbol?: string
): any => {
  const { timestamps = [], klineData, volumeData, movingAverages } = chartData;
  const { ma5, ma10, ma20, ma30 } = movingAverages;
  return {
    animation: false,
    legend: {
      top: 10,
      left: 'center',
      data: [stockSymbol || 'K线', 'MA5', 'MA10', 'MA20', 'MA30'],
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
      },
      borderWidth: 1,
      borderColor: '#ccc',
      padding: 10,
      textStyle: {
        color: '#000',
      },
      position: function (
        pos: any,
        params: any,
        el: any,
        elRect: any,
        size: any
      ) {
        const obj: any = {
          top: 10,
        };
        obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 30;
        return obj;
      },
    },
    axisPointer: {
      link: [
        {
          xAxisIndex: 'all',
        },
      ],
      label: {
        backgroundColor: '#777',
      },
    },
    grid: [
      {
        left: '10%',
        right: '8%',
        height: '45%',
      },
      {
        left: '10%',
        right: '8%',
        top: '70%',
        height: '10%',
      },
    ],
    xAxis: [
      {
        type: 'category',
        data: timestamps.map((timestamp: number) =>
          formatTimestamp(timestamp, currentInterval)
        ),
        boundaryGap: false,
        axisLine: { onZero: false },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
        axisPointer: {
          z: 100,
        },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: timestamps.map((timestamp: number) =>
          formatTimestamp(timestamp, currentInterval)
        ),
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
    ],
    yAxis: [
      {
        scale: true,
        splitArea: {
          show: true,
        },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        max: function (value: any) {
          // 限制交易量Y轴最大值，防止柱子过高
          return value.max * 1.2;
        },
      },
    ],
    series: [
      {
        name: stockSymbol || 'K线',
        type: 'candlestick',
        data: klineData,
        itemStyle: {
          color: CHART_COLORS.up,
          color0: CHART_COLORS.down,
          borderColor: CHART_COLORS.up,
          borderColor0: CHART_COLORS.down,
        },
        markLine: currentPrice
          ? {
              symbol: ['none', 'none'],
              lineStyle: {
                color: '#ff7f00',
                type: 'dashed',
                width: 2,
              },
              label: {
                show: true,
                position: 'end',
                formatter: `${currentPrice.toFixed(2)}`,
                backgroundColor: '#ff7f00',
                color: '#fff',
                padding: [4, 8],
                fontSize: 12,
                fontWeight: 'bold',
              },
              data: [
                {
                  yAxis: currentPrice,
                },
              ],
            }
          : undefined,
      },
      {
        name: 'MA5',
        type: 'line',
        data: ma5,
        smooth: true,
        lineStyle: {
          opacity: 0.5,
          width: 1,
        },
        showSymbol: false,
      },
      {
        name: 'MA10',
        type: 'line',
        data: ma10,
        smooth: true,
        lineStyle: {
          opacity: 0.5,
          width: 1,
        },
        showSymbol: false,
      },
      {
        name: 'MA20',
        type: 'line',
        data: ma20,
        smooth: true,
        lineStyle: {
          opacity: 0.5,
          width: 1,
        },
        showSymbol: false,
      },
      {
        name: 'MA30',
        type: 'line',
        data: ma30,
        smooth: true,
        lineStyle: {
          opacity: 0.5,
          width: 1,
        },
        showSymbol: false,
      },
      {
        name: 'Volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumeData,
        itemStyle: {
          color: function (params: any) {
            // 根据对应K线的涨跌情况设置颜色
            const klineItem = klineData[params.dataIndex];
            if (klineItem && klineItem.length >= 4) {
              // 如果收盘价 >= 开盘价，显示上涨颜色，否则显示下跌颜色
              return klineItem[1] >= klineItem[0]
                ? CHART_COLORS.up
                : CHART_COLORS.down;
            }
            return CHART_COLORS.up; // 默认颜色
          },
        },
      },
    ],
  };
};

/**
 * 生成DataZoom配置选项
 * @param dataLength 数据长度
 * @param chartWidth 图表容器宽度（可选）
 * @returns DataZoom配置对象
 */
export const generateDataZoomOption = (
  dataLength: number,
  chartWidth?: number
) => {
  // 计算最小显示的K线柱子数量
  // 每个K线柱子最小宽度约为8像素，加上间距约12像素
  const minCandleWidth = 12;
  const minVisibleCount = chartWidth
    ? Math.max(10, Math.floor((chartWidth * 0.8) / minCandleWidth))
    : 50;

  // 计算显示范围，确保不少于最小数量
  const visibleCount = Math.min(dataLength, minVisibleCount);
  const start =
    dataLength <= visibleCount
      ? 0
      : Math.max(0, 100 - (100 / dataLength) * visibleCount);

  return {
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start,
        end: 100,
        minSpan: Math.max(1, (visibleCount / dataLength) * 100), // 设置最小缩放范围
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        top: '85%',
        start,
        end: 100,
        minSpan: Math.max(1, (visibleCount / dataLength) * 100), // 设置最小缩放范围
      },
    ],
  };
};
