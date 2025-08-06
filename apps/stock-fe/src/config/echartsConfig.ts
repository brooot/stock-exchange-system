/**
 * ECharts配置选项
 */
import { CHART_COLORS, formatTimestamp } from '../utils/klineUtils';
import type { ChartData } from '../types/klineTypes';

/**
 * 生成ECharts配置选项
 * @param chartData 图表数据
 * @param currentInterval 当前时间间隔
 * @returns ECharts配置对象
 */
export const generateChartOption = (chartData: ChartData, currentInterval: string): any => {
  const { timestamps = [], klineData, volumeData, movingAverages } = chartData;
  const { ma5, ma10, ma20, ma30 } = movingAverages;

  return {
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
        data: timestamps.map((timestamp: number) => formatTimestamp(timestamp, currentInterval)),
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
        data: timestamps.map((timestamp: number) => formatTimestamp(timestamp, currentInterval)),
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
        name: 'Volume',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumeData
      }
    ]
  };
};

/**
 * 生成DataZoom配置选项
 * @param dataLength 数据长度
 * @returns DataZoom配置对象
 */
export const generateDataZoomOption = (dataLength: number) => {
  const start = dataLength <= 50 ? 0 : Math.max(0, 100 - (100 / dataLength) * 50);
  
  return {
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start,
        end: 100
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        top: '85%',
        start,
        end: 100
      }
    ]
  };
};