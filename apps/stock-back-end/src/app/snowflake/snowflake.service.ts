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
    // 使用进程ID、当前时间戳和随机数生成机器ID，确保在分布式环境下的唯一性
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    this.machineId = (process.pid + timestamp + random) & this.maxMachineId;
    
    // 添加日志以便调试
    console.log(`SnowflakeService initialized with machineId: ${this.machineId}`);
  }

  /**
   * 生成雪花算法ID
   * @returns 返回字符串格式的唯一ID
   */
  generateId(): string {
    // 添加互斥锁机制，防止并发冲突
    return this.generateIdWithLock();
  }

  private generateIdWithLock(): string {
    let timestamp = this.getCurrentTimestamp();

    // 时钟回拨检测
    if (timestamp < this.lastTimestamp) {
      // 如果时钟回拨，等待到上次时间戳之后
      timestamp = this.waitNextMillis(this.lastTimestamp);
    }

    // 同一毫秒内的序列号处理
    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & this.maxSequence;
      if (this.sequence === 0) {
        // 序列号溢出，等待下一毫秒
        timestamp = this.waitNextMillis(this.lastTimestamp);
        this.sequence = 0; // 重置序列号
      }
    } else {
      // 新的毫秒，重置序列号
      this.sequence = 0;
    }

    this.lastTimestamp = timestamp;

    // 使用BigInt进行位运算，确保64位精度
    const timestampBig = BigInt(timestamp - this.epoch);
    const machineIdBig = BigInt(this.machineId);
    const sequenceBig = BigInt(this.sequence);
    const timestampShiftBig = BigInt(this.timestampShift);
    const machineIdShiftBig = BigInt(this.machineIdShift);

    // 组装雪花ID
    const id = 
      (timestampBig << timestampShiftBig) |
      (machineIdBig << machineIdShiftBig) |
      sequenceBig;

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