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

  // 获取用户持仓（通过订单计算）
  async getUserPositions(userId: number) {
    const orders = await this.prisma.order.findMany({
      where: {
        userId,
        status: { in: ['FILLED', 'PARTIALLY_FILLED'] },
      },
    });

    // 计算AAPL持仓
    let totalQuantity = 0;
    orders.forEach(order => {
      if (order.type === 'BUY') {
        totalQuantity += order.filledQuantity;
      } else {
        totalQuantity -= order.filledQuantity;
      }
    });

    return {
      symbol: 'AAPL',
      quantity: totalQuantity,
    };
  }
}
