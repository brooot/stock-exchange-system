import { Injectable, NotFoundException } from '@nestjs/common';
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
    const initialPrice = lastOrder ? lastOrder.price : 150.0;

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

  /** 根据用户id获取用户名 */
  async getUserName(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
      },
    });
    return user.username;
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

  async validatePassword(
    password: string,
    passwordHash: string
  ): Promise<boolean> {
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

  /** 安全的余额扣减方法 */
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

  /** 安全的余额增加方法 */
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

  /** 获取用户持仓（直接从持仓表查询） */
  async getUserPositions(userId: number) {
    const positions = await this.prisma.position.findMany({
      where: { userId },
    });

    return positions.map((position) => ({
      symbol: position.symbol,
      quantity: position.quantity,
      avgPrice: position.avgPrice,
    }));
  }

  /** 获取用户特定股票持仓 */
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

  /** 更新用户持仓 */
  async updateUserPosition(
    userId: number,
    symbol: string,
    quantity: number,
    avgPrice: number
  ) {
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
   * @param tx 可选的事务实例，如果传入则使用该事务，否则创建新事务
   */
  async freezeBalance(userId: number, amount: number, tx?: any) {
    if (amount <= 0) {
      throw new Error('冻结金额必须大于0');
    }

    // 使用统一的资金冻结调整方法
    await this.adjustFrozenBalance(userId, amount, tx);
    return this.findById(userId);
  }

  /**
   * 解冻用户资金
   * @param userId 用户ID
   * @param amount 解冻金额
   * @param tx 可选的事务实例，如果传入则使用该事务，否则创建新事务
   */
  async unfreezeBalance(userId: number, amount: number, tx?: any) {
    if (amount <= 0) {
      throw new Error('解冻金额必须大于0');
    }

    // 使用统一的资金冻结调整方法（负数表示解冻）
    await this.adjustFrozenBalance(userId, -amount, tx);
    return this.findById(userId);
  }

  /**
   * 从冻结余额中扣减
   * @param userId 用户ID
   * @param amount 扣减金额
   * @param tx 可选的事务实例，如果传入则使用该事务，否则创建新事务
   */
  async payBalance(userId: number, amount: number, tx?: any) {
    if (amount <= 0) {
      throw new Error('扣减金额必须大于0');
    }

    // 使用统一的资金冻结调整方法（负数表示减少冻结余额，但不增加可用余额）
    // 这里需要特殊处理，因为扣减操作只减少冻结余额，不增加可用余额
    const executeDeduction = async (transaction: any) => {
      // 先检查用户冻结余额
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { frozenBalance: true },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      if (user.frozenBalance.toNumber() < amount) {
        throw new Error(
          `冻结余额不足，当前冻结余额: ${user.frozenBalance}, 需要扣减: ${amount}`
        );
      }

      // 执行扣减操作：同时减少总余额和冻结余额
      // 因为这是实际消费，资金已经用于购买股票
      return await transaction.user.update({
        where: { id: userId },
        data: {
          balance: {
            decrement: amount,
          },
          frozenBalance: {
            decrement: amount,
          },
        },
      });
    };

    let result;
    if (tx) {
      // 使用传入的事务
      result = await executeDeduction(tx);
    } else {
      // 创建新事务
      result = await this.prisma.$transaction(executeDeduction);
    }

    if (!result) {
      throw new Error('从冻结余额扣减操作失败');
    }

    return this.findById(userId);
  }

  // 冻结股票 - 用于卖出订单
  // async freezePosition(userId: number, symbol: string, quantity: number) {
  //   if (quantity <= 0) {
  //     throw new Error('冻结数量必须大于0');
  //   }

  //   // 使用事务确保原子性操作
  //   await this.prisma.$transaction(async (tx) => {
  //     return await this.freezePositionWithTx(userId, symbol, quantity, tx);
  //   });

  //   return this.getUserPosition(userId, symbol);
  // }

  // 冻结股票 - 支持传入事务的版本
  async freezePositionWithTx(
    userId: number,
    symbol: string,
    quantity: number,
    tx: any
  ) {
    if (quantity <= 0) {
      throw new Error('冻结数量必须大于0');
    }

    // 使用统一的持仓冻结数量调整方法
    return await this.adjustFrozenQuantity(userId, symbol, quantity, tx);
  }

  // 解冻股票 - 用于订单取消
  async unfreezePosition(
    userId: number,
    symbol: string,
    quantity: number,
    tx?: any
  ) {
    if (quantity <= 0) {
      throw new Error('解冻数量必须大于0');
    }

    // 使用统一的持仓冻结数量调整方法
    await this.adjustFrozenQuantity(userId, symbol, -quantity, tx);
    return this.getUserPosition(userId, symbol);
  }

  // 从冻结持仓转为实际扣减 - 用于订单成交
  async deductFromFrozenPosition(
    userId: number,
    symbol: string,
    quantity: number,
    tx?: any
  ) {
    if (quantity <= 0) {
      throw new Error('扣减数量必须大于0');
    }

    // 使用统一的持仓冻结数量调整方法
    await this.adjustFrozenQuantity(userId, symbol, -quantity, tx);
    return this.getUserPosition(userId, symbol);
  }

  // 统一的持仓冻结数量调整方法
  async adjustFrozenQuantity(
    userId: number,
    symbol: string,
    quantityChange: number,
    tx?: any
  ) {
    if (quantityChange === 0) {
      throw new Error('数量变化不能为0');
    }

    const executeAdjustment = async (transaction: any) => {
      // 先获取当前持仓状态
      const position = await transaction.position.findUnique({
        where: {
          userId_symbol: { userId, symbol },
        },
        select: { quantity: true, frozenQuantity: true },
      });

      if (!position) {
        throw new Error(`用户 ${userId} 没有股票 ${symbol} 的持仓`);
      }

      const newFrozenQuantity = position.frozenQuantity + quantityChange;

      // 验证新的冻结数量不能为负数
      if (newFrozenQuantity < 0) {
        throw new Error(
          `用户 ${userId} 股票 ${symbol} 冻结持仓不足，当前冻结: ${position.frozenQuantity}，尝试调整: ${quantityChange}`
        );
      }

      // 验证新的冻结数量不能超过总持仓
      if (newFrozenQuantity > position.quantity) {
        throw new Error(
          `用户 ${userId} 股票 ${symbol} 可用持仓不足，当前总持仓: ${position.quantity}，已冻结: ${position.frozenQuantity}，尝试调整: ${quantityChange}`
        );
      }

      // 使用原子操作更新冻结数量
      if (quantityChange > 0) {
        // 增加冻结数量（冻结操作）
        const updateResult = await transaction.$executeRaw`
          UPDATE "positions"
          SET "frozenQuantity" = "frozenQuantity" + ${quantityChange}
          WHERE "userId" = ${userId}
            AND "symbol" = ${symbol}
            AND "quantity" >= "frozenQuantity" + ${quantityChange}
        `;

        if (updateResult === 0) {
          throw new Error(
            `用户 ${userId} 股票 ${symbol} 持仓冻结失败，可能由于并发操作导致可用持仓不足`
          );
        }
      } else {
        // 减少冻结数量（解冻操作）
        const updateResult = await transaction.position.updateMany({
          where: {
            userId,
            symbol,
            frozenQuantity: { gte: Math.abs(quantityChange) },
          },
          data: {
            frozenQuantity: { increment: quantityChange }, // quantityChange 是负数，所以用 increment
          },
        });

        if (updateResult.count === 0) {
          throw new Error(
            `用户 ${userId} 股票 ${symbol} 解冻失败，冻结持仓不足`
          );
        }
      }

      // 返回更新后的持仓信息
      return await transaction.position.findUnique({
        where: {
          userId_symbol: { userId, symbol },
        },
      });
    };

    let result;
    if (tx) {
      // 使用传入的事务
      result = await executeAdjustment(tx);
    } else {
      // 创建新事务
      result = await this.prisma.$transaction(executeAdjustment);
    }

    return result;
  }

  // 统一的持仓冻结数量设置方法
  async setFrozenQuantity(
    userId: number,
    symbol: string,
    newFrozenQuantity: number,
    tx?: any
  ) {
    if (newFrozenQuantity < 0) {
      throw new Error('冻结数量不能为负数');
    }

    const executeSet = async (transaction: any) => {
      // 先获取当前持仓状态
      const position = await transaction.position.findUnique({
        where: {
          userId_symbol: { userId, symbol },
        },
        select: { quantity: true, frozenQuantity: true },
      });

      if (!position) {
        throw new Error(`用户 ${userId} 没有股票 ${symbol} 的持仓`);
      }

      // 验证新的冻结数量不能超过总持仓
      if (newFrozenQuantity > position.quantity) {
        throw new Error(
          `用户 ${userId} 股票 ${symbol} 冻结数量不能超过总持仓，当前总持仓: ${position.quantity}，尝试设置冻结: ${newFrozenQuantity}`
        );
      }

      // 直接设置新的冻结数量
      return await transaction.position.update({
        where: {
          userId_symbol: { userId, symbol },
        },
        data: {
          frozenQuantity: newFrozenQuantity,
        },
      });
    };

    let result;
    if (tx) {
      // 使用传入的事务
      result = await executeSet(tx);
    } else {
      // 创建新事务
      result = await this.prisma.$transaction(executeSet);
    }

    return result;
  }

  // 统一的资金冻结调整方法
  async adjustFrozenBalance(userId: number, amountChange: number, tx?: any) {
    if (amountChange === 0) {
      throw new Error('金额变化不能为0');
    }

    const executeAdjustment = async (transaction: any) => {
      // 先获取当前用户状态
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { balance: true, frozenBalance: true },
      });

      if (!user) {
        throw new Error('用户不存在');
      }

      const currentBalance = user.balance.toNumber();
      const currentFrozen = user.frozenBalance.toNumber();
      const newFrozenBalance = currentFrozen + amountChange;

      // 统一验证新的冻结余额范围
      if (newFrozenBalance < 0) {
        throw new Error(
          `用户 ${userId} 冻结余额不足，当前冻结: ${currentFrozen}，尝试调整: ${amountChange}`
        );
      }
      if (newFrozenBalance > currentBalance) {
        throw new Error(
          `用户 ${userId} 冻结余额不能超过总余额，当前余额: ${currentBalance}，当前冻结: ${currentFrozen}，尝试调整: ${amountChange}`
        );
      }

      // 统一的原子更新操作，使用条件确保数据一致性
      const whereCondition =
        amountChange > 0
          ? { id: userId, balance: { gte: newFrozenBalance } } // 冻结时确保总余额足够
          : { id: userId, frozenBalance: { gte: Math.abs(amountChange) } }; // 解冻时确保冻结余额足够

      const updateResult = await transaction.user.updateMany({
        where: whereCondition,
        data: {
          frozenBalance: { increment: amountChange },
        },
      });

      if (updateResult.count === 0) {
        const operation = amountChange > 0 ? '冻结' : '解冻';
        throw new Error(`用户 ${userId} 资金${operation}失败，余额不足`);
      }

      // 返回更新后的用户信息
      return await transaction.user.findUnique({
        where: { id: userId },
      });
    };

    let result;
    if (tx) {
      // 使用传入的事务
      result = await executeAdjustment(tx);
    } else {
      // 创建新事务
      result = await this.prisma.$transaction(executeAdjustment);
    }

    return result;
  }

  /**
   * 处理持仓的卖出操作
   * @param userId 用户ID
   * @param symbol 股票代码
   * @param sellQuantity 卖出数量
   * @param tx 事务实例
   * @returns 更新后的持仓信息或null（如果持仓被删除）
   */
  async sellPosition(
    userId: number,
    symbol: string,
    sellQuantity: number,
    tx: any
  ) {
    if (sellQuantity <= 0) {
      throw new Error('卖出数量必须大于0');
    }

    // 获取当前持仓信息
    const existingPosition = await tx.position.findUnique({
      where: {
        userId_symbol: {
          userId,
          symbol,
        },
      },
    });

    if (!existingPosition) {
      throw new Error(`用户 ${userId} 没有股票 ${symbol} 的持仓`);
    }

    // 计算实际卖出数量（不能超过冻结持仓）
    const actualSellQuantity = Math.min(
      sellQuantity,
      existingPosition.frozenQuantity
    );

    if (actualSellQuantity <= 0) {
      throw new Error(
        `用户 ${userId} 股票 ${symbol} 冻结持仓不足，当前冻结: ${existingPosition.frozenQuantity}，尝试卖出: ${sellQuantity}`
      );
    }

    console.log(
      `[持仓更新] 卖出操作 - 用户${userId}, 股票${symbol}: ` +
        `原持仓${existingPosition.quantity}, 冻结${existingPosition.frozenQuantity}, ` +
        `卖出${sellQuantity}, 实际卖出${actualSellQuantity}`
    );

    // 同时减少quantity和frozenQuantity
    const newQuantity = existingPosition.quantity - actualSellQuantity;
    const newFrozenQuantity =
      existingPosition.frozenQuantity - actualSellQuantity;

    if (newQuantity > 0) {
      // 更新持仓数量
      const result = await tx.position.update({
        where: {
          userId_symbol: {
            userId,
            symbol,
          },
        },
        data: {
          quantity: newQuantity,
          frozenQuantity: newFrozenQuantity,
        },
      });

      console.log(
        `[持仓更新] 卖出更新完成 - 用户${userId}, 股票${symbol}: ` +
          `剩余持仓${result.quantity}@${result.avgPrice
            .toNumber()
            .toFixed(2)}, ` +
          `冻结${result.frozenQuantity}`
      );

      return result;
    } else {
      console.log(
        `[持仓更新] 清空持仓 - 用户${userId}, 股票${symbol}: ` +
          `原持仓${existingPosition.quantity}已全部卖出`
      );

      // 清空持仓
      await tx.position.delete({
        where: {
          userId_symbol: {
            userId,
            symbol,
          },
        },
      });

      console.log(`[持仓更新] 持仓删除完成 - 用户${userId}, 股票${symbol}`);

      return null; // 持仓已删除
    }
  }

  /**
   * 获取用户可用余额（总余额 - 冻结余额）
   * @param userId 用户ID
   * @param tx 可选的事务实例，如果传入则使用该事务，否则使用默认连接
   * @returns 可用余额
   */
  async getAvailableBalance(userId: number, tx?: any): Promise<number> {
    const executeQuery = async (transaction: any) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          balance: true,
          frozenBalance: true,
        },
      });

      if (!user) {
        throw new NotFoundException(`用户 ${userId} 不存在`);
      }

      const totalBalance = user.balance.toNumber();
      const frozenBalance = user.frozenBalance.toNumber();
      const availableBalance = totalBalance - frozenBalance;

      // 确保可用余额不为负数（理论上不应该发生，但作为安全检查）
      return Math.max(0, availableBalance);
    };

    if (tx) {
      return await executeQuery(tx);
    } else {
      return await executeQuery(this.prisma);
    }
  }

  /**
   * 获取用户可用持仓（总持仓 - 冻结持仓）
   * @param userId 用户ID
   * @param symbol 股票代码
   * @param tx 可选的事务实例，如果传入则使用该事务，否则使用默认连接
   * @returns 可用持仓数量
   */
  async getAvailablePosition(
    userId: number,
    symbol: string,
    tx?: any
  ): Promise<number> {
    const executeQuery = async (transaction: any) => {
      const position = await transaction.position.findUnique({
        where: {
          userId_symbol: {
            userId,
            symbol,
          },
        },
        select: {
          quantity: true,
          frozenQuantity: true,
        },
      });

      if (!position) {
        // 如果没有持仓记录，返回0
        return 0;
      }

      const totalQuantity = position.quantity;
      const frozenQuantity = position.frozenQuantity;
      const availableQuantity = totalQuantity - frozenQuantity;

      // 确保可用持仓不为负数（理论上不应该发生，但作为安全检查）
      return Math.max(0, availableQuantity);
    };

    if (tx) {
      return await executeQuery(tx);
    } else {
      return await executeQuery(this.prisma);
    }
  }
}
