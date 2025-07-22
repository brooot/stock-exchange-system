import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderType } from '@prisma/client';

@Injectable()
export class PositionService {
  constructor(private prisma: PrismaService) {}

  // 获取用户所有持仓
  async getUserPositions(userId: number) {
    return this.prisma.position.findMany({
      where: { userId },
      orderBy: { symbol: 'asc' },
    });
  }

  // 获取用户特定股票持仓
  async getUserPosition(userId: number, symbol: string) {
    return this.prisma.position.findUnique({
      where: {
        userId_symbol: {
          userId,
          symbol,
        },
      },
    });
  }

  // 更新持仓（订单成交时调用）
  async updatePositionOnTrade(
    userId: number,
    symbol: string,
    orderType: OrderType,
    quantity: number,
    price: number
  ) {
    const existingPosition = await this.getUserPosition(userId, symbol);

    if (orderType === OrderType.BUY) {
      if (existingPosition) {
        // 计算新的平均成本价
        const totalCost =
          existingPosition.quantity *
            parseFloat(existingPosition.avgPrice.toString()) +
          quantity * price;
        const totalQuantity = existingPosition.quantity + quantity;
        const newAvgPrice = totalCost / totalQuantity;

        return this.prisma.position.update({
          where: {
            userId_symbol: {
              userId,
              symbol,
            },
          },
          data: {
            quantity: totalQuantity,
            avgPrice: newAvgPrice,
          },
        });
      } else {
        // 创建新持仓
        return this.prisma.position.create({
          data: {
            userId,
            symbol,
            quantity,
            avgPrice: price,
          },
        });
      }
    } else {
      // SELL 订单
      if (existingPosition) {
        const newQuantity = existingPosition.quantity - quantity;

        if (newQuantity > 0) {
          // 更新持仓数量，保持平均成本价不变
          return this.prisma.position.update({
            where: {
              userId_symbol: {
                userId,
                symbol,
              },
            },
            data: {
              quantity: newQuantity,
            },
          });
        } else if (newQuantity === 0) {
          // 清空持仓
          return this.prisma.position.delete({
            where: {
              userId_symbol: {
                userId,
                symbol,
              },
            },
          });
        } else {
          throw new Error('卖出数量超过持仓数量');
        }
      } else {
        throw new Error('没有持仓无法卖出');
      }
    }
  }

  // 检查用户是否有足够的持仓进行卖出
  async checkSellQuantity(
    userId: number,
    symbol: string,
    quantity: number
  ): Promise<boolean> {
    const position = await this.getUserPosition(userId, symbol);
    return position ? position.quantity >= quantity : false;
  }

  // 获取用户持仓总价值
  async getUserPortfolioValue(
    userId: number,
    currentPrices: Record<string, number>
  ) {
    const positions = await this.getUserPositions(userId);

    let totalValue = 0;
    const positionValues = positions.map((position) => {
      const currentPrice =
        currentPrices[position.symbol] ||
        parseFloat(position.avgPrice.toString());
      const value = position.quantity * currentPrice;
      const cost = position.quantity * parseFloat(position.avgPrice.toString());
      const pnl = value - cost;

      totalValue += value;

      return {
        symbol: position.symbol,
        quantity: position.quantity,
        avgPrice: position.avgPrice,
        currentPrice,
        value,
        cost,
        pnl,
        pnlPercent: cost > 0 ? (pnl / cost) * 100 : 0,
      };
    });

    return {
      positions: positionValues,
      totalValue,
    };
  }
}
