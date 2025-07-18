import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderType, OrderMethod } from '@prisma/client';

@Injectable()
export class TradeService {
  constructor(private prisma: PrismaService) {}

  async createTrade(
    userId: number,
    symbol: string,
    price: number,
    quantity: number,
    type: OrderType,
    method: OrderMethod,
  ) {
    return this.prisma.trade.create({
      data: {
        userId,
        symbol,
        price,
        quantity,
        type,
        method,
        isCompleted: false,
      },
    });
  }

  async getTradesByUser(userId: number) {
    return this.prisma.trade.findMany({
      where: { userId },
    });
  }

  async getAllTrades() {
    return this.prisma.trade.findMany();
  }
}
