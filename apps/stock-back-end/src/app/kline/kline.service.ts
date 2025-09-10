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

  // 已处理的K线数据跟踪器，避免重复处理
  private processedKlineData = new Map<string, Set<number>>();

  // 防抖定时器，用于减少重复广播
  private broadcastTimers = new Map<string, NodeJS.Timeout>();

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

  // 待保存的K线数据队列
  private pendingSaveQueue = new Map<string, any>();

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
      // 获取所有有数据的股票符号
      const symbols = await this.getAvailableSymbols();

      if (symbols.length === 0) {
        // console.log('没有找到股票数据，使用默认AAPL进行初始化');
        await this.initializeSymbolCache('AAPL');
        return;
      }

      // console.log(`开始初始化K线缓存，股票数量: ${symbols.length}`);

      // 并行初始化所有股票的缓存以提高性能
      await Promise.all(
        symbols.map((symbol) => this.initializeSymbolCache(symbol))
      );

      // console.log('K线缓存初始化完成');
    } catch (error) {
      // console.error('K线缓存初始化失败:', error);
      // 失败时至少初始化AAPL
      try {
        await this.initializeSymbolCache('AAPL');
        // console.log('已回退到AAPL缓存初始化');
      } catch (fallbackError) {
        // console.error('AAPL缓存初始化也失败:', fallbackError);
      }
    }
  }

  /**
   * 获取所有有数据的股票符号
   */
  private async getAvailableSymbols(): Promise<string[]> {
    try {
      const baseSymbols = await this.prisma.klineBase.findMany({
        select: { symbol: true },
        distinct: ['symbol'],
      });

      const aggregatedSymbols = await this.prisma.klineAggregated.findMany({
        select: { symbol: true },
        distinct: ['symbol'],
      });

      // 合并并去重
      const allSymbols = new Set([
        ...baseSymbols.map((s) => s.symbol),
        ...aggregatedSymbols.map((s) => s.symbol),
      ]);

      return Array.from(allSymbols);
    } catch (error) {
      console.error('获取股票符号失败:', error);
      return ['AAPL']; // 默认返回AAPL
    }
  }

  /**
   * 为指定股票初始化缓存
   */
  private async initializeSymbolCache(symbol: string) {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // 加载基础周期（1分钟）数据
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

      // console.log(`${symbol} K线缓存初始化完成`);
    } catch (error) {
      // console.error(`${symbol} K线缓存初始化失败:`, error);
    }
  }

  /**
   * 处理新的价格更新
   */
  async handlePriceUpdate(priceUpdate: PriceUpdateData) {
    const { symbol, price, volume, timestamp } = priceUpdate;
    const timestampMs = new Date(timestamp).getTime();

    // 计算当前分钟的时间戳（对齐到分钟）
    const minuteTimestamp = Math.floor(timestampMs / (60 * 1000)) * (60 * 1000);
    const cacheKey = `${symbol}_minute`;

    // 累积当前分钟的数据
    let minuteData = this.currentMinuteData.get(cacheKey);
    if (!minuteData || minuteData.timestamp !== minuteTimestamp) {
      // 如果是新的分钟，将上一分钟数据加入待保存队列
      if (minuteData && minuteData.timestamp < minuteTimestamp) {
        const pendingKey = `${symbol}_${minuteData.timestamp}`;
        this.pendingSaveQueue.set(pendingKey, { symbol, data: minuteData });
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
      const timestamp = minuteData.timestamp;
      const processedKey = `${symbol}_1m`;

      // 检查是否已经处理过这个时间戳的数据
      if (!this.processedKlineData.has(processedKey)) {
        this.processedKlineData.set(processedKey, new Set());
      }

      const processedTimestamps = this.processedKlineData.get(processedKey)!;
      if (processedTimestamps.has(timestamp)) {
        // 已经处理过，跳过
        return;
      }

      // 标记为已处理
      processedTimestamps.add(timestamp);

      // 清理过期的时间戳记录（保留最近24小时）
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      for (const ts of processedTimestamps) {
        if (ts < oneDayAgo) {
          processedTimestamps.delete(ts);
        }
      }

      const klineData = {
        symbol,
        timestamp: new Date(timestamp),
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

      // console.log(
      //   `保存1分钟K线: ${symbol} ${new Date(timestamp).toISOString()}`
      // );

      // 触发高级周期聚合
      await this.aggregateHigherIntervals(symbol, timestamp);
    } catch (error) {
      // console.error('保存基础K线失败:', error);
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

      // console.log(
      //   `生成聚合K线: ${symbol} ${interval} ${startTime.toISOString()}`
      // );
    } catch (error) {
      // console.error(`生成聚合K线失败 ${interval}:`, error);
    }
  }

  /**
   * 更新缓存并广播（带防抖机制）
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

    // 使用防抖机制减少重复广播
    this.debouncedBroadcast(
      symbol,
      interval,
      formattedKline,
      existingIndex < 0
    );
  }

  /**
   * 防抖广播机制
   */
  private debouncedBroadcast(
    symbol: string,
    interval: string,
    klineData: KlineData,
    isNewKline: boolean
  ) {
    const broadcastKey = `${symbol}_${interval}`;

    // 清除之前的定时器
    if (this.broadcastTimers.has(broadcastKey)) {
      clearTimeout(this.broadcastTimers.get(broadcastKey)!);
    }

    // 设置新的防抖定时器
    const timer = setTimeout(() => {
      this.marketGateway.server.emit('klineUpdate', {
        interval,
        data: klineData,
        isNewKline,
      });
      this.broadcastTimers.delete(broadcastKey);
    }, 100); // 100ms 防抖延迟

    this.broadcastTimers.set(broadcastKey, timer);
  }

  /**
   * 获取指定时间周期的K线数据
   */
  async getKlineData(
    symbol = 'AAPL',
    interval = '1m',
    limit = 100
  ): Promise<KlineData[]> {
    const cacheKey = `${symbol}_${interval}`;
    let klineData = this.klineCache.get(cacheKey) || [];

    // 如果缓存中的数据不足，尝试从数据库补充
    if (klineData.length < Math.min(limit, 50)) {
      // console.log(
      //   `缓存数据不足 (${klineData.length}/${limit})，从数据库补充 ${symbol} ${interval} 数据`
      // );
      await this.loadDataFromDatabase(symbol, interval, limit);
      klineData = this.klineCache.get(cacheKey) || [];

      // 如果仍然数据不足且不是1分钟周期，尝试生成聚合数据
      if (klineData.length < Math.min(limit, 30) && interval !== '1m') {
        // console.log(
        //   `聚合数据不足，尝试生成缺失的 ${symbol} ${interval} 聚合数据`
        // );
        await this.generateMissingAggregatedData(symbol, interval, limit);
        klineData = this.klineCache.get(cacheKey) || [];
      }
    }

    // 返回最近的limit条数据
    const result = klineData.slice(-limit);
    // console.log(
    //   `返回K线数据: ${symbol} ${interval}, 请求${limit}条, 实际返回${result.length}条`
    // );
    return result;
  }

  /**
   * 从数据库加载数据到缓存
   */
  private async loadDataFromDatabase(
    symbol: string,
    interval: string,
    limit: number
  ) {
    try {
      const config = this.intervals[interval];
      if (!config) {
        console.warn(`不支持的时间周期: ${interval}`);
        return;
      }

      const cacheKey = `${symbol}_${interval}`;

      if (interval === '1m') {
        // 加载基础1分钟数据
        const baseKlines = await this.prisma.klineBase.findMany({
          where: { symbol },
          orderBy: { timestamp: 'desc' },
          take: Math.max(limit, 200), // 至少加载200条以提供缓冲
        });

        const klineData = baseKlines
          .reverse() // 恢复时间顺序
          .map((k) => ({
            timestamp: k.timestamp.getTime(),
            open: k.open.toNumber(),
            high: k.high.toNumber(),
            low: k.low.toNumber(),
            close: k.close.toNumber(),
            volume: k.volume,
            symbol: k.symbol,
            interval: '1m',
          }));

        this.klineCache.set(cacheKey, klineData);
      } else if (config.dbInterval) {
        // 加载聚合数据
        const aggregatedKlines = await this.prisma.klineAggregated.findMany({
          where: {
            symbol,
            interval: config.dbInterval,
          },
          orderBy: { timestamp: 'desc' },
          take: Math.max(limit, 200),
        });

        const klineData = aggregatedKlines.reverse().map((k) => ({
          timestamp: k.timestamp.getTime(),
          open: k.open.toNumber(),
          high: k.high.toNumber(),
          low: k.low.toNumber(),
          close: k.close.toNumber(),
          volume: k.volume,
          symbol: k.symbol,
          interval,
        }));

        this.klineCache.set(cacheKey, klineData);
      } else {
        // 对于没有预聚合的时间周期，从基础数据生成
        await this.generateMissingAggregatedData(symbol, interval, limit);
      }
    } catch (error) {
      console.error(`从数据库加载K线数据失败: ${symbol} ${interval}`, error);
    }
  }

  /**
   * 生成缺失的聚合数据
   */
  private async generateMissingAggregatedData(
    symbol: string,
    interval: string,
    limit: number
  ) {
    try {
      const config = this.intervals[interval];
      if (!config || !config.dbInterval) return;

      const intervalMs = config.ms;
      const now = Date.now();
      const startTime = now - limit * intervalMs * 2; // 扩大范围确保有足够数据

      console.log(
        `开始生成 ${symbol} ${interval} 的聚合数据，时间范围: ${new Date(
          startTime
        ).toISOString()} - ${new Date(now).toISOString()}`
      );

      // 检查哪些时间段缺少数据
      const existingData = await this.prisma.klineAggregated.findMany({
        where: {
          symbol,
          interval: config.dbInterval,
          timestamp: {
            gte: new Date(startTime),
            lte: new Date(now),
          },
        },
        select: { timestamp: true },
      });

      const existingTimestamps = new Set(
        existingData.map((d) => d.timestamp.getTime())
      );
      let generatedCount = 0;

      // 按时间周期生成缺失的聚合数据
      for (
        let timestamp = startTime;
        timestamp < now;
        timestamp += intervalMs
      ) {
        const alignedTimestamp =
          Math.floor(timestamp / intervalMs) * intervalMs;

        if (!existingTimestamps.has(alignedTimestamp)) {
          await this.generateAggregatedKline(
            symbol,
            interval,
            config,
            alignedTimestamp
          );
          generatedCount++;

          // 避免一次性生成过多数据，每生成10条暂停一下
          if (generatedCount % 10 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      }

      console.log(
        `完成生成 ${symbol} ${interval} 聚合数据，新生成 ${generatedCount} 条`
      );
    } catch (error) {
      console.error(`生成聚合数据失败: ${symbol} ${interval}`, error);
    }
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
    // 每分钟处理待保存队列和过期数据
    this.periodicTaskTimer = setInterval(async () => {
      const now = Date.now();
      const currentMinute = Math.floor(now / (60 * 1000)) * (60 * 1000);

      // 处理待保存队列
      for (const [pendingKey, pendingItem] of this.pendingSaveQueue.entries()) {
        try {
          await this.saveBaseKline(pendingItem.symbol, pendingItem.data);
          this.pendingSaveQueue.delete(pendingKey);
        } catch (error) {
          console.error(`处理待保存数据失败: ${pendingKey}`, error);
        }
      }

      // 处理过期的当前分钟数据
      for (const [key, minuteData] of this.currentMinuteData.entries()) {
        if (minuteData.timestamp < currentMinute) {
          const symbol = key.replace('_minute', '');
          try {
            await this.saveBaseKline(symbol, minuteData);
          } catch (error) {
            console.error(`处理过期分钟数据失败: ${key}`, error);
          } finally {
            this.currentMinuteData.delete(key);
          }
        }
      }

      // 检查并补全缺失的K线数据
      await this.fillMissingKlineData();
    }, 60 * 1000); // 每分钟执行

    // 每小时清理过期数据
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredData();
    }, 60 * 60 * 1000);
  }

  /**
   * 检查并补全缺失的K线数据
   * 当没有新交易产生时，用最后已知价格填充空白时间段
   */
  private async fillMissingKlineData() {
    try {
      // console.log('开始检查并填充缺失的K线数据...');
      const symbols = await this.getAvailableSymbols();
      // console.log(`找到 ${symbols.length} 个股票代码需要检查:`, symbols);
      const now = Date.now();
      const currentMinute = Math.floor(now / (60 * 1000)) * (60 * 1000);

      for (const symbol of symbols) {
        await this.fillMissingKlineForSymbol(symbol, currentMinute);
      }
      // console.log('K线数据补全检查完成');
    } catch (error) {
      // console.error('补全缺失K线数据失败:', error);
    }
  }

  /**
   * 为指定股票补全缺失的K线数据
   */
  private async fillMissingKlineForSymbol(
    symbol: string,
    currentMinute: number
  ) {
    try {
      // 获取最后一条K线数据
      const lastKline = await this.prisma.klineBase.findFirst({
        where: { symbol },
        orderBy: { timestamp: 'desc' },
      });

      if (!lastKline) {
        // 如果没有历史数据，跳过
        return;
      }

      const lastTimestamp = lastKline.timestamp.getTime();
      const nextExpectedTimestamp = lastTimestamp + 60 * 1000; // 下一分钟

      // 检查是否有缺失的分钟数据（最多补全最近1小时的数据）
      const oneHourAgo = currentMinute - 60 * 60 * 1000;
      const startFillTime = Math.max(nextExpectedTimestamp, oneHourAgo);

      if (startFillTime >= currentMinute) {
        // 没有需要补全的数据
        return;
      }

      // 检查哪些分钟缺失数据
      const missingTimestamps: number[] = [];
      for (
        let timestamp = startFillTime;
        timestamp < currentMinute;
        timestamp += 60 * 1000
      ) {
        const alignedTimestamp =
          Math.floor(timestamp / (60 * 1000)) * (60 * 1000);

        // 检查数据库中是否已存在该时间戳的数据
        const existing = await this.prisma.klineBase.findUnique({
          where: {
            symbol_timestamp: {
              symbol,
              timestamp: new Date(alignedTimestamp),
            },
          },
        });

        if (!existing) {
          missingTimestamps.push(alignedTimestamp);
        }
      }

      if (missingTimestamps.length === 0) {
        return;
      }

      // console.log(
      //   `发现 ${symbol} 缺失 ${missingTimestamps.length} 分钟的K线数据，开始补全...`
      // );

      // 用最后已知价格补全缺失的数据
      const lastPrice = lastKline.close.toNumber();

      for (const timestamp of missingTimestamps) {
        const klineData = {
          symbol,
          timestamp: new Date(timestamp),
          open: lastKline.close, // 使用最后已知收盘价作为开盘价
          high: lastKline.close, // 无交易时，高低开收都相同
          low: lastKline.close,
          close: lastKline.close,
          volume: 0, // 无交易，成交量为0
        };

        try {
          await this.prisma.klineBase.create({
            data: klineData,
          });

          // 更新缓存
          const cacheKey = `${symbol}_1m`;
          const cachedData = this.klineCache.get(cacheKey) || [];

          const newKlineData = {
            timestamp,
            open: lastPrice,
            high: lastPrice,
            low: lastPrice,
            close: lastPrice,
            volume: 0,
            symbol,
            interval: '1m',
          };

          cachedData.push(newKlineData);
          cachedData.sort((a, b) => a.timestamp - b.timestamp);

          // 保持缓存大小
          if (cachedData.length > 1000) {
            cachedData.splice(0, cachedData.length - 1000);
          }

          this.klineCache.set(cacheKey, cachedData);

          // 广播更新
          this.marketGateway.server.emit('klineUpdate', {
            interval: '1m',
            data: newKlineData,
            isNewKline: true,
            isFilled: true, // 标记为补全数据
          });
        } catch (error) {
          // 如果插入失败（可能是并发插入），忽略错误
          if (!error.message?.includes('duplicate key')) {
            console.error(
              `补全K线数据失败: ${symbol} ${new Date(timestamp).toISOString()}`,
              error
            );
          }
        }
      }

      // console.log(
      //   `完成补全 ${symbol} 的 ${missingTimestamps.length} 分钟K线数据`
      // );

      // 触发高级周期的聚合更新
      for (const timestamp of missingTimestamps) {
        await this.aggregateHigherIntervals(symbol, timestamp);
      }
    } catch (error) {
      console.error(`补全 ${symbol} K线数据失败:`, error);
    }
  }

  /**
   * 清理过期的K线数据
   */
  private cleanupExpiredData() {
    // console.log('开始清理过期的K线缓存数据...');
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const [key, klineData] of this.klineCache.entries()) {
      const originalSize = klineData.length;
      const firstValidIndex = klineData.findIndex(
        (k) => k.timestamp > oneDayAgo
      );

      if (firstValidIndex > 0) {
        klineData.splice(0, firstValidIndex);
        // console.log(
        //   `清理了 ${key} 的缓存，从 ${originalSize} 条减少到 ${klineData.length} 条`
        // );
      } else if (firstValidIndex === -1 && originalSize > 0) {
        this.klineCache.set(key, []);
        // console.log(
        //   `清理了 ${key} 的缓存，所有 ${originalSize} 条数据均已过期`
        // );
      }
    }
    // console.log('过期的K线缓存数据清理完成。');
  }

  onModuleDestroy() {
    // console.log('KlineService 销毁，清理定时器...');

    // 清理定期任务定时器
    if (this.periodicTaskTimer) {
      clearInterval(this.periodicTaskTimer);
    }

    // 清理数据清理定时器
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // 清理所有防抖广播定时器
    for (const timer of this.broadcastTimers.values()) {
      clearTimeout(timer);
    }
    this.broadcastTimers.clear();

    // 清理缓存数据
    this.processedKlineData.clear();

    // console.log('KlineService 清理完成。');
  }
}
