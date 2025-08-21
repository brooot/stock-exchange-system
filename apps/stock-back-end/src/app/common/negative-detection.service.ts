import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NegativeDetectionService {
  private readonly logger = new Logger(NegativeDetectionService.name);
  private systemStopped = false;

  constructor(private prisma: PrismaService) {}

  /**
   * 检查用户余额是否为负数
   */
  async checkUserBalance(
    userId: number,
    context: string,
    tx?: any
  ): Promise<boolean> {
    if (this.systemStopped) return false;
    const prisma = tx ?? this.prisma;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, balance: true, frozenBalance: true },
      });

      if (!user) {
        this.logger.error(`用户不存在: ${userId}, 上下文: ${context}`);
        return false;
      }

      const availableBalance =
        user.balance.toNumber() - (user.frozenBalance?.toNumber() || 0);

      if (
        user.balance.toNumber() < 0 ||
        (user.frozenBalance?.toNumber() || 0) < 0
      ) {
        this.logger.error(
          `🚨 发现负余额! 用户ID: ${userId}, 上下文: ${context}`
        );
        this.logger.error(
          `余额详情: balance=${user.balance.toNumber()}, frozenBalance=${
            user.frozenBalance?.toNumber() || 0
          }, availableBalance=${availableBalance}`
        );
        this.stopSystem(`用户${userId}出现负余额`, context);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `检查用户余额失败: ${error.message}, 用户ID: ${userId}, 上下文: ${context}`
      );
      return false;
    }
  }

  /**
   * 检查用户持仓是否为负数
   */
  async checkUserPosition(
    userId: number,
    symbol: string,
    context: string,
    tx?: any
  ): Promise<boolean> {
    if (this.systemStopped) return false;
    const prisma = tx ?? this.prisma;

    try {
      const position = await prisma.position.findUnique({
        where: {
          userId_symbol: {
            userId,
            symbol,
          },
        },
        select: { quantity: true, frozenQuantity: true },
      });

      if (!position) {
        // 没有持仓记录是正常的
        return true;
      }

      const availableQuantity =
        position.quantity - (position.frozenQuantity || 0);

      if (
        position.quantity < 0 ||
        (position.frozenQuantity || 0) < 0 ||
        availableQuantity < 0
      ) {
        this.logger.error(
          `🚨 发现负持仓! 用户ID: ${userId}, 股票代码: ${symbol}, 上下文: ${context}`
        );
        this.logger.error(
          `持仓详情: quantity=${position.quantity}, frozenQuantity=${position.frozenQuantity}, availableQuantity=${availableQuantity}`
        );
        this.stopSystem(`用户${userId}股票${symbol}出现负持仓`, context);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `检查用户持仓失败: ${error.message}, 用户ID: ${userId}, 股票代码: ${symbol}, 上下文: ${context}`
      );
      return false;
    }
  }

  /**
   * 批量检查多个用户的余额和持仓
   */
  async batchCheckUsersData(
    userIds: number[],
    context: string,
    tx?: any
  ): Promise<boolean> {
    if (this.systemStopped) return false;
    const prisma = tx ?? this.prisma;

    for (const userId of userIds) {
      // 检查余额
      const balanceOk = await this.checkUserBalance(userId, context, tx);
      if (!balanceOk) return false;

      // 检查所有持仓
      const positions = await prisma.position.findMany({
        where: { userId },
        select: { symbol: true },
      });

      for (const position of positions) {
        const positionOk = await this.checkUserPosition(
          userId,
          position.symbol,
          context,
          tx
        );
        if (!positionOk) return false;
      }
    }

    return true;
  }

  /**
   * 停止系统运行
   */
  private stopSystem(reason: string, context: string): void {
    this.systemStopped = true;
    this.logger.error(`🛑 系统已停止运行!`);
    this.logger.error(`停止原因: ${reason}`);
    this.logger.error(`上下文: ${context}`);
    this.logger.error(`时间戳: ${new Date().toISOString()}`);

    // 可以在这里添加更多的停止逻辑，比如发送告警、保存状态等
    process.exit(1); // 强制退出进程
  }

  /**
   * 检查系统是否已停止
   */
  isSystemStopped(): boolean {
    return this.systemStopped;
  }

  /**
   * 重置系统状态（仅用于测试）
   */
  resetSystemState(): void {
    this.systemStopped = false;
  }
}
