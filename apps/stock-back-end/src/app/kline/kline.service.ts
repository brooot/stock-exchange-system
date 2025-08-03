import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketGateway } from '../websocket/market.gateway';
import { KlineInterval } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface KlineData {
  timestamp: number; // Unix时间戳
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  interval: string; // '1m', '5m', '15m', '1h', '1d'
}

export interface PriceUpdateData {
  symbol: string;
  price: number;
  volume: number;
  timestamp: Date;
  tradeId: number;
}

// 周期配置
interface IntervalConfig {
  ms: number; // 毫秒数
  baseMultiplier: number; // 基于1分钟的倍数
  dbInterval?: KlineInterval; // 数据库枚举值
}

@Injectable()
export class KlineService implements OnModuleDestroy {
  // 内存中的K线数据缓存，按时间周期分组
  private klineCache = new Map<string, KlineData[]>();

  // 支持的时间周期配置
  private readonly intervals: Record<string, IntervalConfig> = {
    '1m': { ms: 60 * 1000, baseMultiplier: 1 },
    '5m': {
      ms: 5 * 60 * 1000,
      baseMultiplier: 5,
      dbInterval: KlineInterval.M5,
    },
    '15m': {
      ms: 15 * 60 * 1000,
      baseMultiplier: 15,
      dbInterval: KlineInterval.M15,
    },
    '1h': {
      ms: 60 * 60 * 1000,
      baseMultiplier: 60,
      dbInterval: KlineInterval.H1,
    },
    '1d': {
      ms: 24 * 60 * 60 * 1000,
      baseMultiplier: 1440,
      dbInterval: KlineInterval.D1,
    },
  };

  // 当前分钟的交易数据累积
  private currentMinuteData = new Map<
    string,
    {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      timestamp: number;
    }
  >();

  private periodicTaskTimer: NodeJS.Timeout;
  private cleanupTimer: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private marketGateway: MarketGateway
  ) {
    this.initializeKlineCache();
    this.startPeriodicTasks();
  }

  /**
   * 初始化K线缓存，从数据库加载最近的数据
   */
  private async initializeKlineCache() {
    try {
      const symbol = 'AAPL';

      // 加载基础周期（1分钟）数据
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const baseKlines = await this.prisma.klineBase.findMany({
        where: {
          symbol,
          timestamp: { gte: oneDayAgo },
        },
        orderBy: { timestamp: 'asc' },
      });

      // 转换为缓存格式
      const baseKlineData = baseKlines.map((k) => ({
        timestamp: k.timestamp.getTime(),
        open: k.open.toNumber(),
        high: k.high.toNumber(),
        low: k.low.toNumber(),
        close: k.close.toNumber(),
        volume: k.volume,
        symbol: k.symbol,
        interval: '1m',
      }));
      this.klineCache.set(`${symbol}_1m`, baseKlineData);

      // 加载高级周期数据
      for (const [interval, config] of Object.entries(this.intervals)) {
        if (config.dbInterval) {
          const aggregatedKlines = await this.prisma.klineAggregated.findMany({
            where: {
              symbol,
              interval: config.dbInterval,
              timestamp: { gte: oneDayAgo },
            },
            orderBy: { timestamp: 'asc' },
          });

          const aggregatedData = aggregatedKlines.map((k) => ({
            timestamp: k.timestamp.getTime(),
            open: k.open.toNumber(),
            high: k.high.toNumber(),
            low: k.low.toNumber(),
            close: k.close.toNumber(),
            volume: k.volume,
            symbol: k.symbol,
            interval,
          }));
          this.klineCache.set(`${symbol}_${interval}`, aggregatedData);
        }
      }

      console.log('K线缓存初始化完成');
    } catch (error) {
      console.error('K线缓存初始化失败:', error);
    }
  }

  /**
   * 处理新的价格更新
   */
  //  TODO 如果一直没有新的交易产生，但是K线图的数据还是要更新的，这个是否还没处理？
  async handlePriceUpdate(priceUpdate: PriceUpdateData) {
    const { symbol, price, volume, timestamp } = priceUpdate;
    const timestampMs = new Date(timestamp).getTime();

    // 计算当前分钟的时间戳（对齐到分钟）
    const minuteTimestamp = Math.floor(timestampMs / (60 * 1000)) * (60 * 1000);
    const cacheKey = `${symbol}_minute`;

    // 累积当前分钟的数据
    let minuteData = this.currentMinuteData.get(cacheKey);
    if (!minuteData || minuteData.timestamp !== minuteTimestamp) {
      // 如果是新的分钟，先保存上一分钟的数据
      if (minuteData && minuteData.timestamp < minuteTimestamp) {
        await this.saveBaseKline(symbol, minuteData);
      }

      // 创建新分钟的数据
      minuteData = {
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
        timestamp: minuteTimestamp,
      };
    } else {
      // 更新当前分钟的数据
      minuteData.high = Math.max(minuteData.high, price);
      minuteData.low = Math.min(minuteData.low, price);
      minuteData.close = price;
      minuteData.volume += volume;
    }

    this.currentMinuteData.set(cacheKey, minuteData);

    // 实时更新1分钟K线
    this.updateCacheAndBroadcast(symbol, minuteData, '1m');

    // 实时更新所有其他时间周期的K线
    await this.updateAllIntervalsRealtime(symbol, price, volume, timestampMs);
  }

  /**
   * 实时更新所有时间周期的K线数据
   */
  private async updateAllIntervalsRealtime(
    symbol: string,
    price: number,
    volume: number,
    timestampMs: number
  ) {
    // 遍历所有时间周期（除了1分钟，已经在上面处理了）
    for (const [interval, config] of Object.entries(this.intervals)) {
      if (interval === '1m') continue; // 跳过1分钟，已经处理过了

      const intervalMs = config.ms;
      const alignedTimestamp =
        Math.floor(timestampMs / intervalMs) * intervalMs;
      const cacheKey = `${symbol}_${interval}`;

      // 获取当前缓存的K线数据
      const cachedData = this.klineCache.get(cacheKey) || [];

      // 查找当前时间周期的K线数据
      let currentKline = cachedData.find(
        (k) => k.timestamp === alignedTimestamp
      );

      if (!currentKline) {
        // 如果不存在，创建新的K线数据
        currentKline = {
          timestamp: alignedTimestamp,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: volume,
          symbol,
          interval,
        };
        cachedData.push(currentKline);
        cachedData.sort((a, b) => a.timestamp - b.timestamp);
      } else {
        // 更新现有的K线数据
        currentKline.high = Math.max(currentKline.high, price);
        currentKline.low = Math.min(currentKline.low, price);
        currentKline.close = price;
        currentKline.volume += volume;
      }

      // 保持数据量在合理范围内
      if (cachedData.length > 1000) {
        cachedData.splice(0, cachedData.length - 1000);
      }

      this.klineCache.set(cacheKey, cachedData);

      // 广播更新
      this.marketGateway.server.emit('klineUpdate', {
        interval,
        data: currentKline,
        isNewKline:
          cachedData[cachedData.length - 1] === currentKline &&
          currentKline.volume === volume,
      });
    }
  }

  /**
   * 保存基础周期（1分钟）K线到数据库
   */
  private async saveBaseKline(symbol: string, minuteData: any) {
    try {
      const klineData = {
        symbol,
        timestamp: new Date(minuteData.timestamp),
        open: new Decimal(minuteData.open),
        high: new Decimal(minuteData.high),
        low: new Decimal(minuteData.low),
        close: new Decimal(minuteData.close),
        volume: minuteData.volume,
      };

      // 使用 upsert 避免重复插入
      await this.prisma.klineBase.upsert({
        where: {
          symbol_timestamp: {
            symbol,
            timestamp: klineData.timestamp,
          },
        },
        update: klineData,
        create: klineData,
      });
      console.log(
        `保存1分钟K线: ${symbol} ${new Date(
          minuteData.timestamp
        ).toISOString()}`
      );
      // 触发高级周期聚合
      await this.aggregateHigherIntervals(symbol, minuteData.timestamp);
    } catch (error) {
      console.error('保存基础K线失败:', error);
    }
  }

  /**
   * 聚合生成高级周期K线
   */
  private async aggregateHigherIntervals(
    symbol: string,
    baseTimestamp: number
  ) {
    for (const [interval, config] of Object.entries(this.intervals)) {
      if (!config.dbInterval) continue; // 跳过1分钟周期

      const intervalMs = config.ms;
      const aggregateTimestamp =
        Math.floor(baseTimestamp / intervalMs) * intervalMs;

      // 检查是否需要聚合（当前分钟是否是该周期的最后一分钟）
      const nextMinute = baseTimestamp + 60 * 1000;
      const nextAggregateTimestamp =
        Math.floor(nextMinute / intervalMs) * intervalMs;

      if (aggregateTimestamp !== nextAggregateTimestamp) {
        // 需要聚合
        await this.generateAggregatedKline(
          symbol,
          interval,
          config,
          aggregateTimestamp
        );
      }
    }
  }

  /**
   * 生成聚合K线数据
   */
  private async generateAggregatedKline(
    symbol: string,
    interval: string,
    config: IntervalConfig,
    aggregateTimestamp: number
  ) {
    try {
      const startTime = new Date(aggregateTimestamp);
      const endTime = new Date(aggregateTimestamp + config.ms);

      // 从基础K线数据聚合
      const baseKlines = await this.prisma.klineBase.findMany({
        where: {
          symbol,
          timestamp: {
            gte: startTime,
            lt: endTime,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

      if (baseKlines.length === 0) return;

      // 计算聚合数据
      const aggregatedData = {
        symbol,
        interval: config.dbInterval!,
        timestamp: startTime,
        open: baseKlines[0].open,
        close: baseKlines[baseKlines.length - 1].close,
        high: baseKlines.reduce(
          (max, k) => (k.high.gt(max) ? k.high : max),
          baseKlines[0].high
        ),
        low: baseKlines.reduce(
          (min, k) => (k.low.lt(min) ? k.low : min),
          baseKlines[0].low
        ),
        volume: baseKlines.reduce((sum, k) => sum + k.volume, 0),
      };

      // 保存到数据库
      await this.prisma.klineAggregated.upsert({
        where: {
          symbol_interval_timestamp: {
            symbol,
            interval: config.dbInterval!,
            timestamp: startTime,
          },
        },
        update: aggregatedData,
        create: aggregatedData,
      });

      // 更新缓存
      const klineData: KlineData = {
        timestamp: aggregateTimestamp,
        open: aggregatedData.open.toNumber(),
        high: aggregatedData.high.toNumber(),
        low: aggregatedData.low.toNumber(),
        close: aggregatedData.close.toNumber(),
        volume: aggregatedData.volume,
        symbol,
        interval,
      };

      this.updateCacheAndBroadcast(symbol, klineData, interval);

      console.log(
        `生成聚合K线: ${symbol} ${interval} ${startTime.toISOString()}`
      );
    } catch (error) {
      console.error(`生成聚合K线失败 ${interval}:`, error);
    }
  }

  /**
   * 更新缓存并广播
   */
  private updateCacheAndBroadcast(
    symbol: string,
    klineData: Omit<KlineData, 'symbol' | 'interval'>,
    interval: string
  ) {
    const cacheKey = `${symbol}_${interval}`;
    const cachedData = this.klineCache.get(cacheKey) || [];

    // 查找或创建K线数据
    const existingIndex = cachedData.findIndex(
      (k) => k.timestamp === klineData.timestamp
    );
    const formattedKline: KlineData = {
      timestamp: klineData.timestamp,
      open: klineData.open,
      high: klineData.high,
      low: klineData.low,
      close: klineData.close,
      volume: klineData.volume,
      symbol,
      interval,
    };

    if (existingIndex >= 0) {
      cachedData[existingIndex] = formattedKline;
    } else {
      cachedData.push(formattedKline);
      cachedData.sort((a, b) => a.timestamp - b.timestamp);

      // 保持数据量在合理范围内
      if (cachedData.length > 1000) {
        cachedData.splice(0, cachedData.length - 1000);
      }
    }

    this.klineCache.set(cacheKey, cachedData);

    // 广播更新
    this.marketGateway.server.emit('klineUpdate', {
      interval,
      data: formattedKline,
      isNewKline: existingIndex < 0,
    });
  }

  /**
   * 获取指定时间周期的K线数据
   */
  getKlineData(symbol = 'AAPL', interval = '1m', limit = 100): KlineData[] {
    const cacheKey = `${symbol}_${interval}`;
    const klineData = this.klineCache.get(cacheKey) || [];

    // 返回最近的limit条数据
    return klineData.slice(-limit);
  }

  /**
   * 获取支持的时间周期列表
   */
  getSupportedIntervals(): string[] {
    return Object.keys(this.intervals);
  }

  /**
   * 启动定期任务
   */
  private startPeriodicTasks() {
    // 每分钟检查并保存当前分钟的数据
    this.periodicTaskTimer = setInterval(async () => {
      const now = Date.now();
      const currentMinute = Math.floor(now / (60 * 1000)) * (60 * 1000);

      for (const [key, minuteData] of this.currentMinuteData.entries()) {
        if (minuteData.timestamp < currentMinute) {
          const symbol = key.replace('_minute', '');
          try {
            await this.saveBaseKline(symbol, minuteData);
          } catch (error) {
            console.error(`处理分钟数据失败: ${key}`, error);
          } finally {
            this.currentMinuteData.delete(key);
          }
        }
      }
    }, 60 * 1000); // 每分钟执行

    // 每小时清理过期数据
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredData();
    }, 60 * 60 * 1000);
  }

  /**
   * 清理过期的K线数据
   */
  private cleanupExpiredData() {
    console.log('开始清理过期的K线缓存数据...');
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const [key, klineData] of this.klineCache.entries()) {
      const originalSize = klineData.length;
      const firstValidIndex = klineData.findIndex(
        (k) => k.timestamp > oneDayAgo
      );

      if (firstValidIndex > 0) {
        klineData.splice(0, firstValidIndex);
        console.log(
          `清理了 ${key} 的缓存，从 ${originalSize} 条减少到 ${klineData.length} 条`
        );
      } else if (firstValidIndex === -1 && originalSize > 0) {
        this.klineCache.set(key, []);
        console.log(
          `清理了 ${key} 的缓存，所有 ${originalSize} 条数据均已过期`
        );
      }
    }
    console.log('过期的K线缓存数据清理完成。');
  }

  onModuleDestroy() {
    console.log('KlineService 销毁，清理定时器...');
    if (this.periodicTaskTimer) {
      clearInterval(this.periodicTaskTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}
