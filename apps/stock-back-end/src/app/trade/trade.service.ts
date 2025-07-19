import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderType, OrderMethod, TradeStatus } from '@prisma/client';

@Injectable()
export class TradeService {
  constructor(private prisma: PrismaService) {}

  async createTrade(
    userId: number,
    symbol: string,
    price: number,
    quantity: number,
    type: OrderType,
    method: OrderMethod
  ) {
    const totalAmount = price * quantity;
    const orderId = `ORD${Date.now()}${Math.random()
      .toString(36)
      .substr(2, 5)
      .toUpperCase()}`;

    return this.prisma.trade.create({
      data: {
        orderId,
        userId,
        symbol,
        price,
        quantity,
        totalAmount,
        type,
        method,
        status: TradeStatus.PENDING,
      },
    });
  }

  async getTradesByUser(userId: number) {
    return this.prisma.trade.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllTrades() {
    return this.prisma.trade.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTradeStatus(id: number, status: TradeStatus) {
    const updateData: any = {
      status,
    };

    // 如果状态变为已执行，设置执行时间
    if (status === TradeStatus.EXECUTED) {
      updateData.executedAt = new Date();
    }

    return this.prisma.trade.update({
      where: { id },
      data: updateData,
    });
  }

  async getTradesByStatus(status: TradeStatus) {
    return this.prisma.trade.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTradeById(id: number) {
    return this.prisma.trade.findUnique({
      where: { id },
    });
  }

  async getTradeByOrderId(orderId: string) {
    return this.prisma.trade.findUnique({
      where: { orderId },
    });
  }
}
