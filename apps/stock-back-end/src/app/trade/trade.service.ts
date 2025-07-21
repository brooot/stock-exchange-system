import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TradeService {
  constructor(private prisma: PrismaService) {}

  // 获取所有交易记录
  async getAllTrades() {
    return this.prisma.trade.findMany({
      orderBy: { executedAt: 'desc' },
      include: {
        buyOrder: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        },
        sellOrder: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      }
    });
  }

  // 根据用户获取交易记录
  async getTradesByUser(userId: number) {
    return this.prisma.trade.findMany({
      where: {
        OR: [
          { buyOrder: { userId } },
          { sellOrder: { userId } }
        ]
      },
      orderBy: { executedAt: 'desc' },
      include: {
        buyOrder: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        },
        sellOrder: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      }
    });
  }

  // 根据ID获取交易记录
  async getTradeById(id: number) {
    return this.prisma.trade.findUnique({
      where: { id },
      include: {
        buyOrder: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        },
        sellOrder: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      }
    });
  }
}
