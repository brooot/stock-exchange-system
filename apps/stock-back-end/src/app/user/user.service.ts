import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async createUser(username: string, password: string) {
    // 加密密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 使用upsert操作避免并发创建时的唯一约束冲突
    const user = await this.prisma.user.upsert({
      where: { username },
      update: {
        // 如果用户已存在，不更新任何字段，只返回现有用户
      },
      create: {
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
    await this.prisma.position.upsert({
      where: {
        userId_symbol: {
          userId: user.id,
          symbol: 'AAPL',
        },
      },
      update: {
        quantity: 100,
        avgPrice: initialPrice,
      },
      create: {
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
        frozenBalance: true,
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
    // 验证新余额不能为负数
    if (newBalance < 0) {
      throw new Error(`用户 ${userId} 余额不足，无法更新为负数: ${newBalance}`);
    }

    // 获取当前用户信息进行二次验证
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, balance: true },
    });

    if (!currentUser) {
      throw new NotFoundException(`用户 ${userId} 不存在`);
    }

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

  // 新增：安全的余额扣减方法
  async deductBalance(userId: number, amount: number) {
    if (amount <= 0) {
      throw new Error('扣减金额必须大于0');
    }

    // 使用原子操作进行余额扣减，确保不会出现负数
    const result = await this.prisma.user.updateMany({
      where: {
        id: userId,
        balance: { gte: amount }, // 只有余额足够时才能扣减
      },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });

    if (result.count === 0) {
      // 获取当前余额用于错误信息
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { balance: true, username: true },
      });
      const currentBalance = user ? user.balance.toNumber() : 0;
      throw new Error(
        `用户 ${userId} 余额不足，当前余额: ${currentBalance}，尝试扣减: ${amount}`
      );
    }

    return this.findById(userId);
  }

  // 新增：安全的余额增加方法
  async addBalance(userId: number, amount: number) {
    if (amount <= 0) {
      throw new Error('增加金额必须大于0');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: amount,
        },
      },
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

  /**
   * 冻结用户资金
   * @param userId 用户ID
   * @param amount 冻结金额
   */
  async freezeBalance(userId: number, amount: number) {
    if (amount <= 0) {
      throw new Error('冻结金额必须大于0');
    }

    // 使用事务确保原子性操作
    const result = await this.prisma.$transaction(async (tx) => {
      // 先检查用户余额
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { balance: true, frozenBalance: true }
      });
      
      if (!user) {
        throw new Error('用户不存在');
      }
      
      if (user.balance.toNumber() < amount) {
         throw new Error(`余额不足，当前余额: ${user.balance}, 需要冻结: ${amount}`);
       }
      
      // 执行冻结操作
      return await tx.user.update({
        where: { id: userId },
        data: {
          balance: {
            decrement: amount,
          },
          frozenBalance: {
            increment: amount,
          },
        },
      });
    });
    
    if (!result) {
      throw new Error('冻结余额操作失败');
    }

    return this.findById(userId);
  }

  /**
   * 解冻用户资金
   * @param userId 用户ID
   * @param amount 解冻金额
   */
  async unfreezeBalance(userId: number, amount: number) {
    if (amount <= 0) {
      throw new Error('解冻金额必须大于0');
    }

    // 使用事务确保原子性操作
    const result = await this.prisma.$transaction(async (tx) => {
      // 先检查用户冻结余额
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { balance: true, frozenBalance: true }
      });
      
      if (!user) {
        throw new Error('用户不存在');
      }
      
      if (user.frozenBalance.toNumber() < amount) {
         throw new Error(`冻结余额不足，当前冻结余额: ${user.frozenBalance}, 需要解冻: ${amount}`);
       }
      
      // 执行解冻操作
      return await tx.user.update({
        where: { id: userId },
        data: {
          balance: {
            increment: amount,
          },
          frozenBalance: {
            decrement: amount,
          },
        },
      });
    });
    
    if (!result) {
      throw new Error('解冻余额操作失败');
    }

    return this.findById(userId);
  }

  /**
   * 从冻结余额中扣减
   * @param userId 用户ID
   * @param amount 扣减金额
   */
  async deductFromFrozen(userId: number, amount: number) {
    if (amount <= 0) {
      throw new Error('扣减金额必须大于0');
    }

    // 使用事务确保原子性操作
    const result = await this.prisma.$transaction(async (tx) => {
      // 先检查用户冻结余额
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { frozenBalance: true }
      });
      
      if (!user) {
        throw new Error('用户不存在');
      }
      
      if (user.frozenBalance.toNumber() < amount) {
         throw new Error(`冻结余额不足，当前冻结余额: ${user.frozenBalance}, 需要扣减: ${amount}`);
       }
      
      // 执行扣减操作
      return await tx.user.update({
        where: { id: userId },
        data: {
          frozenBalance: {
            decrement: amount,
          },
        },
      });
    });
    
    if (!result) {
      throw new Error('从冻结余额扣减操作失败');
    }

    return this.findById(userId);
  }

  // 冻结股票 - 用于卖出订单
  async freezePosition(userId: number, symbol: string, quantity: number) {
    if (quantity <= 0) {
      throw new Error('冻结数量必须大于0');
    }

    // 使用原子操作：检查可用持仓并冻结
    const result = await this.prisma.position.updateMany({
      where: {
        userId,
        symbol,
        quantity: { gte: quantity }, // 确保可用持仓足够
      },
      data: {
        quantity: { decrement: quantity },
        frozenQuantity: { increment: quantity },
      },
    });

    if (result.count === 0) {
      const position = await this.prisma.position.findUnique({
        where: {
          userId_symbol: { userId, symbol },
        },
        select: { quantity: true, frozenQuantity: true },
      });
      const currentQuantity = position ? position.quantity : 0;
      throw new Error(
        `用户 ${userId} 股票 ${symbol} 可用持仓不足，当前可用持仓: ${currentQuantity}，尝试冻结: ${quantity}`
      );
    }

    return this.getUserPosition(userId, symbol);
  }

  // 解冻股票 - 用于订单取消
  async unfreezePosition(userId: number, symbol: string, quantity: number) {
    if (quantity <= 0) {
      throw new Error('解冻数量必须大于0');
    }

    // 使用原子操作：检查冻结持仓并解冻
    const result = await this.prisma.position.updateMany({
      where: {
        userId,
        symbol,
        frozenQuantity: { gte: quantity }, // 确保冻结持仓足够
      },
      data: {
        quantity: { increment: quantity },
        frozenQuantity: { decrement: quantity },
      },
    });

    if (result.count === 0) {
      const position = await this.prisma.position.findUnique({
        where: {
          userId_symbol: { userId, symbol },
        },
        select: { quantity: true, frozenQuantity: true },
      });
      const currentFrozenQuantity = position ? position.frozenQuantity : 0;
      throw new Error(
        `用户 ${userId} 股票 ${symbol} 冻结持仓不足，当前冻结持仓: ${currentFrozenQuantity}，尝试解冻: ${quantity}`
      );
    }

    return this.getUserPosition(userId, symbol);
  }

  // 从冻结持仓转为实际扣减 - 用于订单成交
  async deductFromFrozenPosition(userId: number, symbol: string, quantity: number) {
    if (quantity <= 0) {
      throw new Error('扣减数量必须大于0');
    }

    // 使用原子操作：从冻结持仓中扣减
    const result = await this.prisma.position.updateMany({
      where: {
        userId,
        symbol,
        frozenQuantity: { gte: quantity }, // 确保冻结持仓足够
      },
      data: {
        frozenQuantity: { decrement: quantity },
      },
    });

    if (result.count === 0) {
      const position = await this.prisma.position.findUnique({
        where: {
          userId_symbol: { userId, symbol },
        },
        select: { quantity: true, frozenQuantity: true },
      });
      const currentFrozenQuantity = position ? position.frozenQuantity : 0;
      throw new Error(
        `用户 ${userId} 股票 ${symbol} 冻结持仓不足，当前冻结持仓: ${currentFrozenQuantity}，尝试扣减: ${quantity}`
      );
    }

    return this.getUserPosition(userId, symbol);
  }
}
