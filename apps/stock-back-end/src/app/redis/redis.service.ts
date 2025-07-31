import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    try {
      await this.client.connect();
      console.log('Redis connected successfully');
    } catch (error) {
      console.error('Redis connection failed:', error);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  // 缓存订单簿数据
  async cacheOrderBook(symbol: string, orderBook: any): Promise<void> {
    const key = `orderbook:${symbol}`;
    await this.client.setex(key, 60, JSON.stringify(orderBook)); // 缓存60秒
  }

  // 获取缓存的订单簿
  async getCachedOrderBook(symbol: string): Promise<any | null> {
    const key = `orderbook:${symbol}`;
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // 缓存市场数据
  async cacheMarketData(symbol: string, marketData: any): Promise<void> {
    const key = `market:${symbol}`;
    await this.client.setex(key, 30, JSON.stringify(marketData)); // 缓存30秒
  }

  // 获取缓存的市场数据
  async getCachedMarketData(symbol: string): Promise<any | null> {
    const key = `market:${symbol}`;
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // 缓存用户持仓
  async cacheUserPosition(userId: number, symbol: string, position: any): Promise<void> {
    const key = `position:${userId}:${symbol}`;
    await this.client.setex(key, 300, JSON.stringify(position)); // 缓存5分钟
  }

  // 获取缓存的用户持仓
  async getCachedUserPosition(userId: number, symbol: string): Promise<any | null> {
    const key = `position:${userId}:${symbol}`;
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // 清除用户持仓缓存
  async clearUserPositionCache(userId: number, symbol: string): Promise<void> {
    const key = `position:${userId}:${symbol}`;
    await this.client.del(key);
  }

  // 缓存用户余额
  async cacheUserBalance(userId: number, balance: number): Promise<void> {
    const key = `balance:${userId}`;
    await this.client.setex(key, 300, balance.toString()); // 缓存5分钟
  }

  // 获取缓存的用户余额
  async getCachedUserBalance(userId: number): Promise<number | null> {
    const key = `balance:${userId}`;
    const cached = await this.client.get(key);
    return cached ? parseFloat(cached) : null;
  }

  // 清除用户余额缓存
  async clearUserBalanceCache(userId: number): Promise<void> {
    const key = `balance:${userId}`;
    await this.client.del(key);
  }

  // 设置分布式锁
  async acquireLock(key: string, ttl = 10000): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const result = await this.client.set(lockKey, '1', 'PX', ttl, 'NX');
    return result === 'OK';
  }

  // 释放分布式锁
  async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    await this.client.del(lockKey);
  }
}