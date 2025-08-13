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
  const xAxisData = timestamps.map((timestamp: number) =>
    formatTimestamp(timestamp, currentInterval)
  );

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
        data: xAxisData,
        boundaryGap: true,
        axisLine: { onZero: false },
        splitLine: { show: false },
        axisPointer: {
          z: 100,
        },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: xAxisData,
        boundaryGap: true,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
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
                color: '#ff7f00',
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
        markPoint: {
          symbol: 'rect',
          symbolSize: [20, 2],
          itemStyle: {
            color: '#000',
          },
          label: {
            show: true,
            formatter: function (params: any) {
              return params.value.toFixed(2);
            },
            color: '#000',
            padding: [0, 0],
            fontSize: 10,
            fontWeight: 'bold',
          },
          data: [
            {
              name: 'min point on close',
              type: 'min',
              valueDim: 'lowest',
              symbolOffset: [12, 0],
              label: {
                position: 'bottom',
                offset: [0, 0],
              },
            },
            {
              name: 'max point on close',
              type: 'max',
              valueDim: 'highest',
              symbolOffset: [12, 0],
              label: {
                position: 'top',
                offset: [0, 0],
              },
            },
          ],
        },
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
 * @param currentInterval 当前时间周期
 * @param displayState 当前显示状态
 * @param timestamps 时间戳数组
 * @returns DataZoom配置对象
 */
export const generateDataZoomOption = (
  dataLength: number,
  currentInterval?: string,
  displayState?: {
    endTimestamp?: number;
    visibleCount?: number;
    startIndex?: number;
    endIndex?: number;
  },
  timestamps?: number[]
) => {
  let visibleCount = 15; // 默认显示15个柱子
  let start = 0;
  let end = 100;

  // 如果有保存的显示状态，尝试保持一致性
  if (
    displayState &&
    displayState.endTimestamp &&
    displayState.visibleCount &&
    timestamps &&
    timestamps.length > 0
  ) {
    // 找到最接近保存的截止时间的索引
    let endIndex = timestamps.length - 1;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps[i] <= displayState.endTimestamp) {
        endIndex = i;
        break;
      }
    }

    // 计算应该显示的柱子数量（不超过保存的数量）
    const maxVisibleCount = Math.min(displayState.visibleCount, endIndex + 1);
    visibleCount = maxVisibleCount;

    // 计算开始和结束的百分比
    const startIndex = Math.max(0, endIndex - visibleCount + 1);
    start = (startIndex / dataLength) * 100;
    end = ((endIndex + 1) / dataLength) * 100;

    // 确保end不超过100%
    end = Math.min(end, 100);

    // 如果计算出的范围太小，调整到合理范围
    if (end - start < 5) {
      end = Math.min(100, start + 5);
    }
  } else {
    // 首次加载或没有保存状态时，显示最后的数据
    if (dataLength <= visibleCount) {
      // 如果数据总量少于或等于要显示的柱子数，显示全部数据
      start = 0;
      end = 100;
    } else {
      // 如果数据总量大于要显示的柱子数，显示最后的 visibleCount 个柱子
      const endIndex = dataLength - 1;
      const startIndex = Math.max(0, endIndex - visibleCount + 1);
      start = (startIndex / dataLength) * 100;
      end = ((endIndex + 1) / dataLength) * 100;
    }
  }

  // const minSpan = Math.max(1, (visibleCount / dataLength) * 100);
  return {
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start,
        end,
        // minSpan, // 设置最小缩放范围
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        top: '85%',
        start,
        end,
        // minSpan, // 设置最小缩放范围
      },
    ],
  };
};
