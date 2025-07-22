import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async createUser(username: string, password: string) {
    // 检查用户名是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictException('用户名已存在');
    }

    // 加密密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        balance: true,
        createdAt: true,
      },
    });

    // 获取最近一个订单的价格，如果没有则使用默认价格150
    const lastOrder = await this.prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const initialPrice = lastOrder ? lastOrder.price : 150.00;

    // 为新用户初始化100股AAPL股票持仓
    await this.prisma.position.create({
      data: {
        userId: user.id,
        symbol: 'AAPL',
        quantity: 100,
        avgPrice: initialPrice,
      },
    });

    return user;
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        balance: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async validatePassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  async updateBalance(userId: number, newBalance: number) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { balance: newBalance },
      select: {
        id: true,
        username: true,
        balance: true,
      },
    });
  }

  // 获取用户持仓（直接从持仓表查询）
  async getUserPositions(userId: number) {
    const positions = await this.prisma.position.findMany({
      where: { userId },
    });

    return positions.map(position => ({
      symbol: position.symbol,
      quantity: position.quantity,
      avgPrice: position.avgPrice,
    }));
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

  // 更新用户持仓
  async updateUserPosition(userId: number, symbol: string, quantity: number, avgPrice: number) {
    return this.prisma.position.upsert({
      where: {
        userId_symbol: {
          userId,
          symbol,
        },
      },
      update: {
        quantity,
        avgPrice,
      },
      create: {
        userId,
        symbol,
        quantity,
        avgPrice,
      },
    });
  }
}
