import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { OrderService } from '../order/order.service';
import { OrderType, OrderMethod } from '@prisma/client';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private botUsers: number[] = [];

  // 配置参数
  private readonly BOT_COUNT = 10; // 机器人数量
  private readonly TRADE_INTERVAL = 1000; // 交易间隔（毫秒）
  private readonly PRICE_VARIANCE = 0.5; // 价格波动范围（50%，减少极端价格偏离）
  private readonly ORDER_TIMEOUT = 1000000; // 订单超时时间 ms
  private readonly MIN_ORDER_SIZE = 1; // 最小订单数量
  private readonly MAX_ORDER_SIZE = 100; // 最大订单数量（减小以增加交易频率）

  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private orderService: OrderService
  ) {}

  /** 模块初始化时自动启动机器人交易 */
  async onModuleInit() {
    try {
      // 延迟启动，确保所有依赖服务都已初始化
      setTimeout(async () => {
        this.logger.log('正在自动启动机器人交易系统...');
        const result = await this.startBotTrading();
        if (result.success) {
          this.logger.log('机器人交易系统自动启动成功');
        } else {
          this.logger.error('机器人交易系统自动启动失败:', result.message);
        }
      }, 5000); // 延迟5秒启动
    } catch (error) {
      this.logger.error('机器人交易系统自动启动异常:', error);
    }
  }

  /** 启动机器人交易 */
  async startBotTrading() {
    if (this.isRunning) {
      this.logger.warn('机器人交易已在运行中');
      return { success: false, message: '机器人交易已在运行中' };
    }

    try {
      // 初始化机器人账户
      await this.initializeBotUsers();

      this.isRunning = true;

      // 启动定时交易
      this.intervalId = setInterval(async () => {
        await this.executeBotTradingCycle();
      }, this.TRADE_INTERVAL);

      this.logger.log('机器人交易系统已启动');
      return { success: true, message: '机器人交易系统已启动' };
    } catch (error) {
      this.logger.error('启动机器人交易失败:', error);
      return { success: false, message: '启动机器人交易失败' };
    }
  }

  /** 停止机器人交易 */
  async stopBotTrading() {
    if (!this.isRunning) {
      return { success: false, message: '机器人交易未在运行' };
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // 取消所有机器人的未完成订单
    await this.cancelAllBotOrders();

    this.logger.log('机器人交易系统已停止');
    return { success: true, message: '机器人交易系统已停止' };
  }

  /** 获取机器人交易状态 */
  getBotStatus() {
    return {
      isRunning: this.isRunning,
      botCount: this.botUsers.length,
      tradeInterval: this.TRADE_INTERVAL,
      priceVariance: this.PRICE_VARIANCE,
    };
  }

  /** 初始化机器人账户 */
  private async initializeBotUsers() {
    this.botUsers = [];

    for (let i = 1; i <= this.BOT_COUNT; i++) {
      const botUsername = `bot_trader_${i}`;

      // 检查机器人账户是否已存在
      let botUser = await this.userService.findByUsername(botUsername);

      if (!botUser) {
        // 创建机器人账户
        const newBotUser = await this.userService.createUser(
          botUsername,
          'bot_password_123'
        );

        // 给机器人账户充值
        await this.userService.updateBalance(newBotUser.id, 100000); // 10万美元初始资金

        this.logger.log(`创建机器人账户: ${botUsername}`);

        // 重新获取完整的用户信息
        botUser = await this.userService.findByUsername(botUsername);
      }

      // 为所有机器人账户（包括现有的）初始化持仓
      await this.initializeBotPosition(botUser.id);

      this.botUsers.push(botUser.id);
    }
  }

  /** 为机器人初始化持仓 */
  private async initializeBotPosition(botUserId: number) {
    try {
      // 检查是否已有持仓
      const existingPosition = await this.userService.getUserPosition(
        botUserId,
        'AAPL'
      );

      if (!existingPosition || existingPosition.quantity === 0) {
        // 随机生成初始持仓数量（100-500股）
        const initialQuantity = Math.floor(Math.random() * 401) + 100;
        // 随机生成平均成本价格（140-160美元）
        const avgPrice = Math.random() * 20 + 140;

        await this.userService.updateUserPosition(
          botUserId,
          'AAPL',
          initialQuantity,
          avgPrice
        );

        this.logger.log(
          `为机器人 ${botUserId} 初始化持仓: ${initialQuantity}股 AAPL @ $${avgPrice.toFixed(
            2
          )}`
        );
      } else {
        this.logger.log(
          `机器人 ${botUserId} 已有持仓: ${
            existingPosition.quantity
          }股 AAPL @ $${existingPosition.avgPrice.toFixed(2)}`
        );
      }
    } catch (error) {
      this.logger.error(`初始化机器人 ${botUserId} 持仓失败:`, error);
    }
  }

  /** 执行一轮机器人交易 */
  private async executeBotTradingCycle() {
    try {
      // 清理过期订单
      await this.cleanupExpiredOrders();

      // 获取当前市场价格
      const currentPrice = await this.getCurrentMarketPrice();

      // 为每个机器人生成交易决策
      for (const botUserId of this.botUsers) {
        if (Math.random() < 0.4) {
          // 40% 概率进行交易（降低交易频率，减少价格冲击）
          await this.generateBotOrder(botUserId, currentPrice);
        }
      }

      // 额外的市场做市逻辑：确保总是有买卖订单
      await this.ensureMarketLiquidity(currentPrice);
    } catch (error) {
      this.logger.error('机器人交易周期执行失败:', error);
    }
  }

  /** 获取当前市场价格 */
  private async getCurrentMarketPrice(): Promise<number> {
    // 获取最近的交易价格
    const latestTrade = await this.prisma.trade.findFirst({
      orderBy: { executedAt: 'desc' },
      select: { price: true },
    });

    if (latestTrade) {
      return latestTrade.price.toNumber();
    }

    // 如果没有交易记录，获取最近的订单价格
    const latestOrder = await this.prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { price: true },
    });

    return latestOrder ? latestOrder.price.toNumber() : 150.0; // 默认价格
  }

  /** 为机器人生成订单 */
  private async generateBotOrder(botUserId: number, currentPrice: number) {
    try {
      // 获取机器人的资金和持仓信息
      const user = await this.userService.findById(botUserId);
      const position = await this.userService.getUserPosition(
        botUserId,
        'AAPL'
      );
      const balance = user.balance.toNumber();
      const holdingQuantity = position ? position.quantity : 0;
      const avgCost = position ? position.avgPrice.toNumber() : currentPrice;

      // 检查是否有足够的资金或持仓进行交易
      const canBuy = balance >= currentPrice * this.MIN_ORDER_SIZE;
      const canSell = holdingQuantity >= this.MIN_ORDER_SIZE;

      // this.logger.debug(
      //   `机器人 ${botUserId} 交易检查: 余额=$${balance.toFixed(2)}, 持仓=${holdingQuantity}股, 当前价格=$${currentPrice.toFixed(2)}, 可买=${canBuy}, 可卖=${canSell}`
      // );

      if (!canBuy && !canSell) {
        // this.logger.debug(`机器人 ${botUserId} 既不能买也不能卖，跳过交易`);
        return; // 既不能买也不能卖
      }

      // 更激进的交易策略：基于市场情况和随机性
      let orderType: OrderType;

      if (!canBuy) {
        orderType = OrderType.SELL;
        // this.logger.debug(
        //   `机器人 ${botUserId} 决策: 强制选择 ${orderType} (canBuy=${canBuy}, canSell=${canSell})`
        // );
      } else if (!canSell) {
        orderType = OrderType.BUY;
        // this.logger.debug(
        //   `机器人 ${botUserId} 决策: 强制选择 ${orderType} (canBuy=${canBuy}, canSell=${canSell})`
        // );
      } else {
        // 两种操作都可以时，使用更平衡的策略
        let buyProbability = 0.5;

        // 基于持仓调整概率 - 更激进的平衡策略
        if (holdingQuantity > 150) {
          buyProbability = 0.2; // 持仓多时强烈倾向卖出
        } else if (holdingQuantity < 150) {
          buyProbability = 0.6; // 持仓少时适度倾向买入
        }

        // 基于盈亏调整概率 - 增强盈利卖出倾向
        const profitRatio = currentPrice / avgCost;
        if (profitRatio > 1.05) {
          buyProbability -= 0.4; // 盈利5%以上时强烈倾向卖出
        } else if (profitRatio > 1.02) {
          buyProbability -= 0.3; // 盈利2%以上时倾向卖出
        } else if (profitRatio < 0.95) {
          buyProbability += 0.3; // 亏损5%以上时倾向买入
        } else if (profitRatio < 0.98) {
          buyProbability += 0.1; // 轻微亏损时略微倾向买入
        }

        // 确保概率在合理范围内
        buyProbability = Math.max(0.1, Math.min(0.9, buyProbability));

        orderType =
          Math.random() < buyProbability ? OrderType.BUY : OrderType.SELL;

        // this.logger.debug(
        //   `机器人 ${botUserId} 决策: 持仓=${holdingQuantity}, 盈亏比=${profitRatio.toFixed(3)}, 买入概率=${buyProbability.toFixed(2)}, 选择=${orderType}`
        // );
      }

      // 生成订单价格和数量：使用概率分布，越靠近市价的订单数量越少
      const { orderPrice, quantity, orderMethod } =
        this.generatePriceAndQuantityWithDistribution(
          orderType,
          currentPrice,
          balance,
          holdingQuantity
        );

      if (!orderPrice || !quantity) {
        // this.logger.debug(
        //   `机器人 ${botUserId} 无法生成有效订单: orderPrice=${orderPrice}, quantity=${quantity}, orderType=${orderType}`
        // );
        return; // 无法生成有效订单
      }

      // 最终检查并下单
      const canPlaceOrder = await this.checkBotCanPlaceOrder(
        botUserId,
        orderType,
        orderPrice,
        quantity
      );

      if (!canPlaceOrder) {
        // this.logger.debug(
        //   `机器人 ${botUserId} 最终检查失败: ${orderType} ${quantity}股 @ $${orderPrice.toFixed(2)}`
        // );
        return;
      }

      if (canPlaceOrder) {
        await this.orderService.createOrder(
          botUserId,
          'AAPL', // 默认股票代码
          orderType,
          orderMethod,
          orderPrice,
          quantity
        );

        const priceDeviation =
          orderMethod === OrderMethod.MARKET
            ? 0
            : Math.abs(((orderPrice - currentPrice) / currentPrice) * 100);

        // this.logger.debug(
        //   `机器人 ${botUserId} 下单: ${orderType} ${quantity}股 @ $${orderPrice.toFixed(
        //     2
        //   )} ${
        //     orderMethod === OrderMethod.MARKET
        //       ? '(市价)'
        //       : `(限价,偏离${priceDeviation.toFixed(2)}%)`
        //   } (当前市价:$${currentPrice.toFixed(
        //     2
        //   )}, 持仓:${holdingQuantity}, 余额:$${balance.toFixed(2)})`
        // );
      }
    } catch (error) {
      this.logger.error(`机器人 ${botUserId} 下单失败:`, error);
    }
  }

  /** 生成基于概率分布的价格和数量 */
  private generatePriceAndQuantityWithDistribution(
    orderType: OrderType,
    currentPrice: number,
    balance: number,
    holdingQuantity: number
  ): {
    orderPrice: number | null;
    quantity: number | null;
    orderMethod: OrderMethod;
  } {
    // 25%概率使用市价单（增加市价单比例，促进价格发现）
    const useMarketPrice = Math.random() < 0.25;

    if (useMarketPrice) {
      // 市价单：使用当前价格，数量较小
      const quantity =
        orderType === OrderType.BUY
          ? Math.min(
              Math.floor(Math.random() * 3) + 1,
              Math.floor(balance / currentPrice)
            )
          : Math.min(Math.floor(Math.random() * 3) + 1, holdingQuantity);

      if (quantity < this.MIN_ORDER_SIZE) {
        return {
          orderPrice: null,
          quantity: null,
          orderMethod: OrderMethod.MARKET,
        };
      }

      return {
        orderPrice: currentPrice,
        quantity,
        orderMethod: OrderMethod.MARKET,
      };
    }

    // 限价单：使用概率分布
    // 价格偏离度：使用PRICE_VARIANCE参数控制最大偏离范围
    const maxDeviation = this.PRICE_VARIANCE; // 使用配置的价格波动范围
    const minDeviation = 0.01; // 最小1%偏离

    // 使用指数分布生成价格偏离度
    const lambda = 3; // 指数分布参数，控制分布形状
    const randomValue = Math.random();
    const deviation =
      minDeviation +
      (maxDeviation - minDeviation) * (-Math.log(1 - randomValue) / lambda);
    const clampedDeviation = Math.min(deviation, maxDeviation);

    let orderPrice: number;
    if (orderType === OrderType.BUY) {
      // 买单：价格低于市价
      orderPrice = currentPrice * (1 - clampedDeviation);
    } else {
      // 卖单：价格高于市价
      orderPrice = currentPrice * (1 + clampedDeviation);
    }

    orderPrice = Math.max(0.01, orderPrice);

    // 数量与价格偏离度成正比：偏离越大，数量越多
    const deviationRatio = clampedDeviation / maxDeviation; // 0-1之间
    const baseQuantity = this.MIN_ORDER_SIZE;
    const maxQuantityMultiplier = 10; // 最大数量倍数

    // 使用平方根函数让数量增长更平缓
    const quantityMultiplier =
      1 + Math.sqrt(deviationRatio) * (maxQuantityMultiplier - 1);
    const targetQuantity = Math.floor(baseQuantity * quantityMultiplier);

    // 检查资金/持仓限制
    let quantity: number;
    if (orderType === OrderType.BUY) {
      const maxAffordable = Math.floor(balance / orderPrice);
      quantity = Math.min(targetQuantity, maxAffordable, this.MAX_ORDER_SIZE);
    } else {
      quantity = Math.min(targetQuantity, holdingQuantity, this.MAX_ORDER_SIZE);
    }

    if (quantity < this.MIN_ORDER_SIZE) {
      return {
        orderPrice: null,
        quantity: null,
        orderMethod: OrderMethod.LIMIT,
      };
    }

    return {
      orderPrice,
      quantity,
      orderMethod: OrderMethod.LIMIT,
    };
  }

  /** 生成流动性订单的价格和数量（偏向更接近市价） */
  private generateLiquidityPriceAndQuantity(
    orderType: OrderType,
    currentPrice: number,
    balance: number,
    holdingQuantity: number
  ): {
    orderPrice: number | null;
    quantity: number | null;
    orderMethod: OrderMethod;
  } {
    // 15%概率使用市价单（比普通订单稍高）
    const useMarketPrice = Math.random() < 0.15;

    if (useMarketPrice) {
      // 市价单：使用当前价格，数量中等
      const quantity =
        orderType === OrderType.BUY
          ? Math.min(
              Math.floor(Math.random() * 8) + 2,
              Math.floor(balance / currentPrice)
            )
          : Math.min(Math.floor(Math.random() * 8) + 2, holdingQuantity);

      if (quantity < this.MIN_ORDER_SIZE) {
        return {
          orderPrice: null,
          quantity: null,
          orderMethod: OrderMethod.MARKET,
        };
      }

      return {
        orderPrice: currentPrice,
        quantity,
        orderMethod: OrderMethod.MARKET,
      };
    }

    // 限价单：流动性订单偏向更接近市价，偏离度较小
    const maxDeviation = (this.PRICE_VARIANCE / 100) * 0.4; // 流动性订单使用40%的价格波动范围
    const minDeviation = 0.0005; // 最小0.05%偏离

    // 使用更陡峭的指数分布，让价格更集中在市价附近
    const lambda = 5; // 更大的lambda值，分布更陡峭
    const randomValue = Math.random();
    const deviation =
      minDeviation +
      (maxDeviation - minDeviation) * (-Math.log(1 - randomValue) / lambda);
    const clampedDeviation = Math.min(deviation, maxDeviation);

    let orderPrice: number;
    if (orderType === OrderType.BUY) {
      // 买单：价格低于市价
      orderPrice = currentPrice * (1 - clampedDeviation);
    } else {
      // 卖单：价格高于市价
      orderPrice = currentPrice * (1 + clampedDeviation);
    }

    orderPrice = Math.max(0.01, orderPrice);

    // 流动性订单的数量策略：偏离度越大，数量稍微增加，但增幅较小
    const deviationRatio = clampedDeviation / maxDeviation; // 0-1之间
    const baseQuantity = this.MIN_ORDER_SIZE;
    const maxQuantityMultiplier = 5; // 较小的数量倍数

    // 使用线性函数，增长更温和
    const quantityMultiplier = 1 + deviationRatio * (maxQuantityMultiplier - 1);
    const targetQuantity = Math.floor(baseQuantity * quantityMultiplier);

    // 检查资金/持仓限制
    let quantity: number;
    if (orderType === OrderType.BUY) {
      const maxAffordable = Math.floor(balance / orderPrice);
      quantity = Math.min(targetQuantity, maxAffordable, this.MAX_ORDER_SIZE);
    } else {
      quantity = Math.min(targetQuantity, holdingQuantity, this.MAX_ORDER_SIZE);
    }

    if (quantity < this.MIN_ORDER_SIZE) {
      return {
        orderPrice: null,
        quantity: null,
        orderMethod: OrderMethod.LIMIT,
      };
    }

    return {
      orderPrice,
      quantity,
      orderMethod: OrderMethod.LIMIT,
    };
  }

  /** 检查机器人是否可以下单 */
  private async checkBotCanPlaceOrder(
    botUserId: number,
    orderType: OrderType,
    price: number,
    quantity: number
  ): Promise<boolean> {
    try {
      const user = await this.userService.findById(botUserId);

      if (orderType === OrderType.BUY) {
        // 检查资金是否足够
        const requiredAmount = price * quantity;
        return user.balance.toNumber() >= requiredAmount;
      } else {
        // 检查持仓是否足够
        const position = await this.userService.getUserPosition(
          botUserId,
          'AAPL'
        );
        return position && position.quantity >= quantity;
      }
    } catch (error) {
      return false;
    }
  }

  /** 清理过期订单 */
  private async cleanupExpiredOrders() {
    const expiredTime = new Date(Date.now() - this.ORDER_TIMEOUT);

    try {
      // 查找机器人的过期订单
      const expiredOrders = await this.prisma.order.findMany({
        where: {
          userId: { in: this.botUsers },
          status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
          createdAt: { lt: expiredTime },
        },
      });

      // 取消过期订单
      for (const order of expiredOrders) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { status: 'CANCELLED' },
        });
      }

      if (expiredOrders.length > 0) {
        // this.logger.debug(`清理了 ${expiredOrders.length} 个过期订单`);
      }
    } catch (error) {
      this.logger.error('清理过期订单失败:', error);
    }
  }

  /** 确保市场流动性 - 做市策略 */
  private async ensureMarketLiquidity(currentPrice: number) {
    try {
      // 检查当前市场上的买卖订单数量
      const openOrders = await this.prisma.order.findMany({
        where: {
          status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
        },
        select: {
          type: true,
          price: true,
        },
      });

      const buyOrders = openOrders.filter((o) => o.type === 'BUY');
      const sellOrders = openOrders.filter((o) => o.type === 'SELL');

      // 如果买单太少，让一个机器人下买单
      if (buyOrders.length < 3) {
        const randomBot =
          this.botUsers[Math.floor(Math.random() * this.botUsers.length)];
        await this.placeLiquidityOrder(randomBot, OrderType.BUY, currentPrice);
      }

      // 如果卖单太少，让一个机器人下卖单
      if (sellOrders.length < 3) {
        const randomBot =
          this.botUsers[Math.floor(Math.random() * this.botUsers.length)];
        await this.placeLiquidityOrder(randomBot, OrderType.SELL, currentPrice);
      }
    } catch (error) {
      this.logger.error('确保市场流动性失败:', error);
    }
  }

  /** 下流动性订单 */
  private async placeLiquidityOrder(
    botUserId: number,
    orderType: OrderType,
    currentPrice: number
  ) {
    try {
      const user = await this.userService.findById(botUserId);
      const position = await this.userService.getUserPosition(
        botUserId,
        'AAPL'
      );
      const balance = user.balance.toNumber();
      const holdingQuantity = position ? position.quantity : 0;

      // 流动性订单也使用概率分布策略，但偏向更接近市价
      const { orderPrice, quantity, orderMethod } =
        this.generateLiquidityPriceAndQuantity(
          orderType,
          currentPrice,
          balance,
          holdingQuantity
        );

      if (!orderPrice || !quantity) {
        return; // 无法生成有效的流动性订单
      }

      const canPlaceOrder = await this.checkBotCanPlaceOrder(
        botUserId,
        orderType,
        orderPrice,
        quantity
      );

      if (canPlaceOrder) {
        await this.orderService.createOrder(
          botUserId,
          'AAPL', // 默认股票代码
          orderType,
          orderMethod,
          orderPrice,
          quantity
        );

        const liquidityPriceDeviation =
          orderMethod === OrderMethod.MARKET
            ? 0
            : Math.abs(((orderPrice - currentPrice) / currentPrice) * 100);

        // this.logger.debug(
        //   `机器人 ${botUserId} 下流动性订单: ${orderType} ${quantity}股 @ $${orderPrice.toFixed(
        //     2
        //   )} ${
        //     orderMethod === OrderMethod.MARKET
        //       ? '(市价)'
        //       : `(限价,偏离${liquidityPriceDeviation.toFixed(2)}%)`
        //   }`
        // );
      }
    } catch (error) {
      this.logger.error(`机器人 ${botUserId} 下流动性订单失败:`, error);
    }
  }

  /** 取消所有机器人订单 */
  private async cancelAllBotOrders() {
    try {
      await this.prisma.order.updateMany({
        where: {
          userId: { in: this.botUsers },
          status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
        },
        data: { status: 'CANCELLED' },
      });

      this.logger.log('已取消所有机器人订单');
    } catch (error) {
      this.logger.error('取消机器人订单失败:', error);
    }
  }
}
