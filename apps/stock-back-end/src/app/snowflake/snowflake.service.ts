import { Injectable } from '@nestjs/common';

@Injectable()
export class SnowflakeService {
  private readonly epoch = 1640995200000; // 2022-01-01 00:00:00 UTC
  private readonly machineIdBits = 10;
  private readonly sequenceBits = 12;
  private readonly maxMachineId = (1 << this.machineIdBits) - 1;
  private readonly maxSequence = (1 << this.sequenceBits) - 1;
  private readonly machineIdShift = this.sequenceBits;
  private readonly timestampShift = this.sequenceBits + this.machineIdBits;

  private machineId: number;
  private sequence = 0;
  private lastTimestamp = -1;

  constructor() {
    // 使用进程ID和随机数生成机器ID，确保在分布式环境下的唯一性
    this.machineId = (process.pid + Math.floor(Math.random() * 1000)) & this.maxMachineId;
  }

  /**
   * 生成雪花算法ID
   * @returns 返回字符串格式的唯一ID
   */
  generateId(): string {
    let timestamp = this.getCurrentTimestamp();

    // 时钟回拨检测
    if (timestamp < this.lastTimestamp) {
      throw new Error(`时钟回拨检测：当前时间戳 ${timestamp} 小于上次时间戳 ${this.lastTimestamp}`);
    }

    // 同一毫秒内的序列号处理
    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & this.maxSequence;
      if (this.sequence === 0) {
        // 序列号溢出，等待下一毫秒
        timestamp = this.waitNextMillis(this.lastTimestamp);
      }
    } else {
      // 新的毫秒，重置序列号
      this.sequence = 0;
    }

    this.lastTimestamp = timestamp;

    // 组装雪花ID
    const id = 
      ((timestamp - this.epoch) << this.timestampShift) |
      (this.machineId << this.machineIdShift) |
      this.sequence;

    // 转换为字符串返回，确保兼容现有的UUID字符串格式
    return id.toString();
  }

  /**
   * 获取当前时间戳
   */
  private getCurrentTimestamp(): number {
    return Date.now();
  }

  /**
   * 等待下一毫秒
   */
  private waitNextMillis(lastTimestamp: number): number {
    let timestamp = this.getCurrentTimestamp();
    while (timestamp <= lastTimestamp) {
      timestamp = this.getCurrentTimestamp();
    }
    return timestamp;
  }

  /**
   * 解析雪花ID，用于调试
   */
  parseId(id: string): {
    timestamp: number;
    machineId: number;
    sequence: number;
    generatedAt: Date;
  } {
    const idNum = BigInt(id);
    const timestamp = Number((idNum >> BigInt(this.timestampShift)) + BigInt(this.epoch));
    const machineId = Number((idNum >> BigInt(this.machineIdShift)) & BigInt(this.maxMachineId));
    const sequence = Number(idNum & BigInt(this.maxSequence));

    return {
      timestamp,
      machineId,
      sequence,
      generatedAt: new Date(timestamp),
    };
  }

  /**
   * 获取当前机器ID
   */
  getMachineId(): number {
    return this.machineId;
  }
}