import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { OrderService } from '../order/order.service';
import { OrderType, OrderMethod } from '@prisma/client';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private botUsers: number[] = [];

  // 并发控制
  private readonly botLocks = new Map<number, boolean>(); // 机器人锁
  private isExecutingCycle = false; // 交易周期锁

  // 配置参数
  private readonly BOT_COUNT = 10; // 机器人数量
  private readonly TRADE_INTERVAL = 1000; // 交易间隔（毫秒）
  private readonly PRICE_VARIANCE = 0.3; // 价格波动范围（30%，减少极端价格偏离）
  private readonly ORDER_TIMEOUT = 3600000; // 订单超时时间 ms
  private readonly MIN_ORDER_SIZE = 1; // 最小订单数量
  private readonly MAX_ORDER_SIZE = 100; // 最大订单数量（减小以增加交易频率）

  // 新增：长期趋势控制参数
  private readonly LONG_TERM_BULL_BIAS = 0.08; // 长期看涨偏向（8%，降低固定偏向）
  private readonly TREND_CHECK_INTERVAL = 180000; // 趋势检查间隔（3分钟，更频繁）
  private trendCheckIntervalId: NodeJS.Timeout | null = null;
  private marketTrendBias = 0; // 市场趋势偏向：正值看涨，负值看跌

  // 新增：市场情绪和波动性控制
  private readonly MARKET_SENTIMENT_INTERVAL = 600000; // 市场情绪变化间隔（10分钟）
  private readonly VOLATILITY_CHECK_INTERVAL = 120000; // 波动性检查间隔（2分钟）
  private marketSentimentIntervalId: NodeJS.Timeout | null = null;
  private volatilityCheckIntervalId: NodeJS.Timeout | null = null;
  private marketSentiment = 0; // 市场情绪：-1到1之间，负值悲观，正值乐观
  private volatilityMultiplier = 1.0; // 波动性倍数：影响价格偏离度
  private trendCycle = 0; // 趋势周期：用于创建波浪式价格变化

  // 新增：随机事件机制
  private readonly RANDOM_EVENT_CHECK_INTERVAL = 30000; // 随机事件检查间隔（30秒）
  private readonly RANDOM_EVENT_PROBABILITY = 0.002; // 随机事件概率（0.2%）
  private randomEventIntervalId: NodeJS.Timeout | null = null;
  private lastRandomEventTime = 0; // 上次随机事件时间
  private readonly MIN_RANDOM_EVENT_INTERVAL = 300000; // 最小随机事件间隔（5分钟）

  // 资金和持仓管理配置
  private readonly MIN_BALANCE_THRESHOLD = 5000; // 最低资金阈值（提高到5000防止余额不足）
  private readonly MIN_POSITION_THRESHOLD = 10; // 最低持仓阈值
  private readonly BALANCE_REFILL_AMOUNT = 50000; // 资金补充金额
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 健康检查间隔（1分钟）

  private healthCheckIntervalId: NodeJS.Timeout | null = null;

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

      // 启动健康检查
      this.healthCheckIntervalId = setInterval(async () => {
        await this.performHealthCheck();
      }, this.HEALTH_CHECK_INTERVAL);

      // 启动趋势检查
      this.trendCheckIntervalId = setInterval(async () => {
        await this.checkLongTermTrend();
      }, this.TREND_CHECK_INTERVAL);

      // 启动市场情绪变化
      this.marketSentimentIntervalId = setInterval(async () => {
        await this.updateMarketSentiment();
      }, this.MARKET_SENTIMENT_INTERVAL);

      // 启动波动性检查
      this.volatilityCheckIntervalId = setInterval(async () => {
        await this.updateVolatility();
      }, this.VOLATILITY_CHECK_INTERVAL);

      // 启动随机事件检查
      this.randomEventIntervalId = setInterval(async () => {
        await this.checkRandomEvents();
      }, this.RANDOM_EVENT_CHECK_INTERVAL);

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

    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }

    if (this.trendCheckIntervalId) {
      clearInterval(this.trendCheckIntervalId);
      this.trendCheckIntervalId = null;
    }

    if (this.marketSentimentIntervalId) {
      clearInterval(this.marketSentimentIntervalId);
      this.marketSentimentIntervalId = null;
    }

    if (this.volatilityCheckIntervalId) {
      clearInterval(this.volatilityCheckIntervalId);
      this.volatilityCheckIntervalId = null;
    }

    if (this.randomEventIntervalId) {
      clearInterval(this.randomEventIntervalId);
      this.randomEventIntervalId = null;
    }

    // 取消所有机器人的未完成订单
    await this.cancelAllBotOrders();

    this.logger.log('机器人交易系统已停止');
    return { success: true, message: '机器人交易系统已停止' };
  }

  /** 模块销毁时清理资源 */
  async onModuleDestroy() {
    await this.stopBotTrading();
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

      // 初始化机器人锁状态
      this.botLocks.set(botUser.id, false);

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
    // 防止并发执行
    if (this.isExecutingCycle) {
      this.logger.debug('交易周期正在执行中，跳过本次执行');
      return;
    }
    this.logger.debug('执行！');

    this.isExecutingCycle = true;

    try {
      // 清理过期订单
      await this.cleanupExpiredOrders();

      // 获取当前市场价格
      const currentPrice = await this.getCurrentMarketPrice();

      // 为每个机器人生成交易决策
      for (const botUserId of this.botUsers) {
        if (Math.random() < 0.4) {
          // 40% 概率进行交易（降低交易频率，减少价格冲击）
          await this.generateBotOrderWithLock(botUserId, currentPrice);
        }
      }

      // 额外的市场做市逻辑：确保总是有买卖订单
      await this.ensureMarketLiquidity(currentPrice);
    } catch (error) {
      this.logger.error('机器人交易周期执行失败:', error);
    } finally {
      // 释放交易周期锁
      this.isExecutingCycle = false;
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

  /** 带锁的机器人订单生成 */
  private async generateBotOrderWithLock(botUserId: number, currentPrice: number) {
    // 检查机器人是否已被锁定
    if (this.botLocks.get(botUserId)) {
      this.logger.debug(`机器人 ${botUserId} 正在执行交易，跳过本次操作`);
      return;
    }

    // 锁定机器人
    this.botLocks.set(botUserId, true);

    try {
      await this.generateBotOrder(botUserId, currentPrice);
    } finally {
      // 释放机器人锁
      this.botLocks.set(botUserId, false);
    }
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
      // 对于买单，需要考虑冻结余额和安全边际
      const availableBalance = balance - user.frozenBalance.toNumber();
      const minBuyAmount = currentPrice * this.MIN_ORDER_SIZE;
      const canBuy = availableBalance >= minBuyAmount * 1.01; // 1%安全边际

      // 对于卖单，需要考虑冻结持仓
      const availableQuantity = holdingQuantity - (position?.frozenQuantity || 0);
      const canSell = availableQuantity >= this.MIN_ORDER_SIZE;

      if (!canBuy && !canSell) {
        this.logger.debug(
          `机器人 ${botUserId} 无法交易: 可用余额=${availableBalance.toFixed(2)}, 可用持仓=${availableQuantity}`
        );
        return; // 既不能买也不能卖
      }

      // 更激进的交易策略：基于市场情况和随机性
      let orderType: OrderType;

      if (!canBuy) {
        orderType = OrderType.SELL;
      } else if (!canSell) {
        orderType = OrderType.BUY;
      } else {
        // 两种操作都可以时，使用更平衡的策略
        // 综合考虑长期偏向、市场趋势、市场情绪和趋势周期
        let buyProbability =
          0.5 +
          this.LONG_TERM_BULL_BIAS +
          this.marketTrendBias +
          this.marketSentiment * 0.1 +
          Math.sin(this.trendCycle) * 0.05;

        // 基于持仓调整概率 - 更激进的平衡策略
        if (holdingQuantity > 150) {
          buyProbability = 0.2; // 持仓多时强烈倾向卖出
        } else if (holdingQuantity < 150) {
          buyProbability = 0.6 + this.LONG_TERM_BULL_BIAS; // 持仓少时适度倾向买入，加上看涨偏向
        }

        // 基于盈亏调整概率 - 增强盈利卖出倾向
        const profitRatio = currentPrice / avgCost;
        if (profitRatio > 1.05) {
          buyProbability -= 0.4; // 盈利5%以上时强烈倾向卖出
        } else if (profitRatio > 1.02) {
          buyProbability -= 0.3; // 盈利2%以上时倾向卖出
        } else if (profitRatio < 0.965) {
          buyProbability += 0.4; // 亏损5%以上时倾向买入
        } else if (profitRatio < 0.985) {
          buyProbability += 0.1; // 轻微亏损时略微倾向买入
        }

        // 确保概率在合理范围内
        buyProbability = Math.max(0.1, Math.min(0.9, buyProbability));

        orderType =
          Math.random() < buyProbability ? OrderType.BUY : OrderType.SELL;
      }

      // 生成订单价格和数量：使用概率分布，越靠近市价的订单数量越少
      const { orderPrice, quantity, orderMethod } =
        this.generatePriceAndQuantityWithDistribution(
          orderType,
          currentPrice,
          availableBalance,
          availableQuantity
        );

      if (!orderPrice || !quantity) {
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
        return;
      }

      // 严格的余额验证
      const balanceValidation = await this.validateBotOrderBalance(
        botUserId,
        orderType,
        orderPrice,
        quantity
      );

      if (!balanceValidation.valid) {
        this.logger.debug(
          `机器人 ${botUserId} 订单验证失败: ${balanceValidation.reason}`
        );
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

        // const priceDeviation =
        //   orderMethod === OrderMethod.MARKET
        //     ? 0
        //     : Math.abs(((orderPrice - currentPrice) / currentPrice) * 100);
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
              Math.floor((balance * 0.99) / currentPrice) // 1%安全边际
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
    // 价格偏离度：使用PRICE_VARIANCE参数控制最大偏离范围，并考虑波动性倍数
    const maxDeviation = this.PRICE_VARIANCE * this.volatilityMultiplier; // 使用配置的价格波动范围乘以波动性倍数
    const minDeviation = 0.005; // 最小0.5%偏离

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
      // 使用可用余额而不是总余额，并考虑安全边际
      const maxAffordable = Math.floor((balance * 0.99) / orderPrice); // 1%安全边际
      quantity = Math.min(targetQuantity, maxAffordable, this.MAX_ORDER_SIZE);
    } else {
      // 使用可用持仓而不是总持仓
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

  /** 生成流动性的价格和数量（偏向更接近市价） */
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

    // 限价单：流动订单偏向更接近市价，偏离度较小
    const maxDeviation = (this.PRICE_VARIANCE / 100) * 0.4; // 流动订单使用40%的价格波动范围
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

    // 流动订单的数量策略：偏离度越大，数量稍微增加，但增幅较小
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
        // 检查资金是否足够，添加安全边际
        const requiredAmount = price * quantity;
        const safetyMargin = requiredAmount * 0.01; // 1%安全边际，防止价格微小波动
        const totalRequired = requiredAmount + safetyMargin;

        // 检查可用余额（总余额 - 冻结余额）
        const availableBalance = user.balance.toNumber() - user.frozenBalance.toNumber();

        if (availableBalance < totalRequired) {
          this.logger.debug(
            `机器人 ${botUserId} 买单余额不足: 可用=${availableBalance.toFixed(2)}, 需要=${totalRequired.toFixed(2)}`
          );
          return false;
        }

        return true;
      } else {
        // 检查持仓是否足够
        const position = await this.userService.getUserPosition(
          botUserId,
          'AAPL'
        );

        if (!position) {
          this.logger.debug(`机器人 ${botUserId} 无持仓，无法卖出`);
          return false;
        }

        // 检查可用持仓（总持仓 - 冻结持仓）
        const availableQuantity = position.quantity - (position.frozenQuantity || 0);

        if (availableQuantity < quantity) {
          this.logger.debug(
            `机器人 ${botUserId} 卖单持仓不足: 可用=${availableQuantity}, 需要=${quantity}`
          );
          return false;
        }

        return true;
      }
    } catch (error) {
      this.logger.error(`检查机器人 ${botUserId} 下单条件失败:`, error);
      return false;
    }
  }

  /** 严格的余额验证机制 */
  private async validateBotOrderBalance(
    botUserId: number,
    orderType: OrderType,
    price: number,
    quantity: number
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      const user = await this.userService.findById(botUserId);
      if (!user) {
        return { valid: false, reason: '用户不存在' };
      }

      if (orderType === OrderType.BUY) {
        // 买入订单验证
        const baseAmount = price * quantity;
        const feeRate = 0.001; // 0.1% 手续费
        const fee = baseAmount * feeRate;
        const priceBuffer = baseAmount * 0.02; // 2% 价格波动缓冲
        const totalRequired = baseAmount + fee + priceBuffer;

        const availableBalance = user.balance.toNumber() - user.frozenBalance.toNumber();

        if (availableBalance < totalRequired) {
          return {
            valid: false,
            reason: `余额不足: 需要 ${totalRequired.toFixed(2)}, 可用 ${availableBalance.toFixed(2)}`
          };
        }

        // 额外检查：确保不会超过总余额的80%
        if (totalRequired > user.balance.toNumber() * 0.8) {
          return {
            valid: false,
            reason: '单笔订单金额过大，超过总余额的80%'
          };
        }

      } else {
        // 卖出订单验证
        const position = await this.userService.getUserPosition(botUserId, 'AAPL');
        if (!position) {
          return { valid: false, reason: '无持仓记录' };
        }

        const availableQuantity = position.quantity - (position.frozenQuantity || 0);

        if (availableQuantity < quantity) {
          return {
            valid: false,
            reason: `股票数量不足: 需要 ${quantity}, 可用 ${availableQuantity}`
          };
        }

        // 额外检查：确保不会一次性卖出超过80%的持仓
        if (quantity > position.quantity * 0.8) {
          return {
            valid: false,
            reason: '单笔卖出数量过大，超过总持仓的80%'
          };
        }
      }

      return { valid: true };

    } catch (error) {
      this.logger.error('验证机器人订单余额失败:', error);
      return { valid: false, reason: '验证过程出错' };
    }
  }

  /** 清理过期订单 */
  private async cleanupExpiredOrders() {
    const expiredTime = new Date(Date.now() - this.ORDER_TIMEOUT);

    try {
      // 查找机器人的过期订单，限制数量避免一次处理太多
      const expiredOrders = await this.prisma.order.findMany({
        where: {
          userId: { in: this.botUsers },
          status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
          createdAt: { lt: expiredTime },
        },
        take: 50, // 限制每次最多处理50个订单
        select: {
          id: true,
          userId: true,
          type: true,
          price: true,
          quantity: true,
          symbol: true,
        },
      });

      if (expiredOrders.length === 0) {
        return;
      }

      // 使用批量操作来取消订单，避免大量单独事务
      await this.batchCancelExpiredOrders(expiredOrders);

      this.logger.debug(`批量清理了 ${expiredOrders.length} 个过期订单`);
    } catch (error) {
      this.logger.error('清理过期订单失败:', error);
    }
  }

  /** 批量取消过期订单 */
  private async batchCancelExpiredOrders(orders: any[]) {
    if (orders.length === 0) return;

    try {
      // 使用单个事务批量处理所有取消操作
      await this.prisma.$transaction(
        async (tx) => {
          const orderIds = orders.map((order) => order.id);

          // 批量更新订单状态为CANCELLED
          await tx.order.updateMany({
            where: {
              id: { in: orderIds },
              status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
            },
            data: {
              status: 'CANCELLED',
            },
          });

          // 批量处理资金/股票解冻
          const userUpdates = new Map<
            number,
            { balanceToAdd: number; positionToAdd: number }
          >();

          for (const order of orders) {
            const userId = order.userId;
            const isBuyOrder = order.type === 'BUY';

            if (!userUpdates.has(userId)) {
              userUpdates.set(userId, { balanceToAdd: 0, positionToAdd: 0 });
            }

            const userUpdate = userUpdates.get(userId)!;

            if (isBuyOrder) {
              // 买单：解冻资金
              const frozenAmount = order.price.toNumber() * order.quantity;
              userUpdate.balanceToAdd += frozenAmount;
            } else {
              // 卖单：解冻股票
              userUpdate.positionToAdd += order.quantity;
            }
          }

          // 批量更新用户资金和持仓
          for (const [userId, updates] of userUpdates) {
            if (updates.balanceToAdd > 0) {
              await tx.user.update({
                where: { id: userId },
                data: {
                  frozenBalance: { decrement: updates.balanceToAdd },
                  balance: { increment: updates.balanceToAdd },
                },
              });
            }

            if (updates.positionToAdd > 0) {
              // 获取用户持仓
              const position = await tx.position.findUnique({
                where: {
                  userId_symbol: {
                    userId: userId,
                    symbol: 'AAPL', // 假设都是AAPL股票
                  },
                },
              });

              if (position) {
                await tx.position.update({
                  where: {
                    userId_symbol: {
                      userId: userId,
                      symbol: 'AAPL',
                    },
                  },
                  data: {
                    frozenQuantity: { decrement: updates.positionToAdd },
                    quantity: { increment: updates.positionToAdd },
                  },
                });
              }
            }
          }
        },
        {
          timeout: 30000, // 30秒超时
        }
      );
    } catch (error) {
      this.logger.error('批量取消过期订单失败:', error);
      // 如果批量操作失败，回退到逐个处理（但限制数量）
      await this.fallbackCancelOrders(orders.slice(0, 10));
    }
  }

  /** 回退的逐个取消订单方法 */
  private async fallbackCancelOrders(orders: any[]) {
    for (const order of orders) {
      try {
        await this.orderService.cancelOrder(order.id, order.userId);
        // 添加延迟避免过快的连续操作
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error(`回退取消订单 ${order.id} 失败:`, error);
      }
    }
  }

  /** 执行健康检查和资源补充 */
  private async performHealthCheck() {
    try {
      for (const botUserId of this.botUsers) {
        await this.checkAndRefillBotResources(botUserId);
      }

      // 执行市场平衡检查
      await this.balanceMarketDirection();
    } catch (error) {
      this.logger.error('健康检查失败:', error);
    }
  }

  /** 检查并补充机器人资源 */
  private async checkAndRefillBotResources(botUserId: number) {
    try {
      const user = await this.userService.findById(botUserId);
      if (!user) return;

      // 检查并补充资金
      if (user.balance.toNumber() < this.MIN_BALANCE_THRESHOLD) {
        await this.userService.updateBalance(
          botUserId,
          this.BALANCE_REFILL_AMOUNT
        );
        this.logger.debug(
          `机器人 ${botUserId} 资金补充: ${this.BALANCE_REFILL_AMOUNT}`
        );
      }

      // 检查并补充持仓
      const position = await this.userService.getUserPosition(
        botUserId,
        'AAPL'
      );
      if (!position || position.quantity < this.MIN_POSITION_THRESHOLD) {
        const refillQuantity = Math.floor(Math.random() * 200) + 100; // 100-300股
        const avgPrice = 150 + Math.random() * 50; // 150-200价格区间
        await this.userService.updateUserPosition(
          botUserId,
          'AAPL',
          (position?.quantity || 0) + refillQuantity,
          avgPrice
        );
        this.logger.debug(`机器人 ${botUserId} 持仓补充: ${refillQuantity}股`);
      }
    } catch (error) {
      this.logger.error(`机器人 ${botUserId} 资源检查失败:`, error);
    }
  }

  /** 市场方向平衡机制 */
  private async balanceMarketDirection() {
    try {
      // 获取最近的交易记录
      const recentTrades = await this.prisma.trade.findMany({
        orderBy: { executedAt: 'desc' },
        take: 10,
        select: { price: true, executedAt: true },
      });

      if (recentTrades.length < 5) return;

      // 计算价格趋势
      const prices = recentTrades.map((trade) => trade.price.toNumber());
      const priceChange = prices[0] - prices[prices.length - 1];
      const changePercent = Math.abs(priceChange) / prices[prices.length - 1];

      // 如果价格单向变化超过3%，触发反向交易（从5%降低到3%）
      if (changePercent > 0.03) {
        const isRising = priceChange > 0;
        await this.executeBalancingTrades(isRising);
        this.logger.debug(
          `检测到价格${isRising ? '上涨' : '下跌'}${(
            changePercent * 100
          ).toFixed(2)}%，执行平衡交易`
        );
      }
    } catch (error) {
      this.logger.error('市场平衡检查失败:', error);
    }
  }

  /** 执行平衡交易 */
  private async executeBalancingTrades(isPriceRising: boolean) {
    try {
      // 随机选择2-3个机器人执行反向交易
      const selectedBots = this.botUsers
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.floor(Math.random() * 2) + 2);

      const currentPrice = await this.getCurrentMarketPrice();

      for (const botUserId of selectedBots) {
        // 价格上涨时增加卖出，价格下跌时增加买入
        const orderType = isPriceRising ? OrderType.SELL : OrderType.BUY;
        await this.placeLiquidityOrderWithLock(botUserId, orderType, currentPrice);
      }
    } catch (error) {
      this.logger.error('执行平衡交易失败:', error);
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
        await this.placeLiquidityOrderWithLock(randomBot, OrderType.BUY, currentPrice);
      }

      // 如果卖单太少，让一个机器人下卖单
      if (sellOrders.length < 3) {
        const randomBot =
          this.botUsers[Math.floor(Math.random() * this.botUsers.length)];
        await this.placeLiquidityOrderWithLock(randomBot, OrderType.SELL, currentPrice);
      }
    } catch (error) {
      this.logger.error('确保市场流动性失败:', error);
    }
  }

  /** 带锁的流动性订单 */
  private async placeLiquidityOrderWithLock(
    botUserId: number,
    orderType: OrderType,
    currentPrice: number
  ) {
    // 检查机器人是否已被锁定
    if (this.botLocks.get(botUserId)) {
      this.logger.debug(`机器人 ${botUserId} 正在执行交易，跳过流动性订单`);
      return;
    }

    // 锁定机器人
    this.botLocks.set(botUserId, true);

    try {
      await this.placeLiquidityOrder(botUserId, orderType, currentPrice);
    } finally {
      // 释放机器人锁
      this.botLocks.set(botUserId, false);
    }
  }

  /** 下流动订单 */
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

      // 流动订单也使用概率分布策略，但偏向更接近市价
      const { orderPrice, quantity, orderMethod } =
        this.generateLiquidityPriceAndQuantity(
          orderType,
          currentPrice,
          balance,
          holdingQuantity
        );

      if (!orderPrice || !quantity) {
        return; // 无法生成有效的流动订单
      }

      const canPlaceOrder = await this.checkBotCanPlaceOrder(
        botUserId,
        orderType,
        orderPrice,
        quantity
      );

      if (!canPlaceOrder) {
        return;
      }

      // 严格的余额验证
      const balanceValidation = await this.validateBotOrderBalance(
        botUserId,
        orderType,
        orderPrice,
        quantity
      );

      if (!balanceValidation.valid) {
        this.logger.debug(
          `机器人 ${botUserId} 流动性订单验证失败: ${balanceValidation.reason}`
        );
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
      }
    } catch (error) {
      this.logger.error(`机器人 ${botUserId} 下流动订单失败:`, error);
    }
  }

  /** 取消所有机器人订单 */
  private async cancelAllBotOrders() {
    try {
      // 查找所有需要取消的机器人订单
      const ordersToCancel = await this.prisma.order.findMany({
        where: {
          userId: { in: this.botUsers },
          status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
        },
        select: {
          id: true,
          userId: true,
          type: true,
          price: true,
          quantity: true,
          symbol: true,
        },
      });

      if (ordersToCancel.length === 0) {
        return;
      }

      // 使用批量操作取消所有机器人订单
      await this.batchCancelExpiredOrders(ordersToCancel);

      this.logger.log(`已批量取消 ${ordersToCancel.length} 个机器人订单`);
    } catch (error) {
      this.logger.error('取消机器人订单失败:', error);
    }
  }

  /** 长期趋势检查机制 - 改进版 */
  private async checkLongTermTrend() {
    try {
      // 更新趋势周期，用于创建波浪式变化
      this.trendCycle += 0.1;
      if (this.trendCycle > Math.PI * 2) {
        this.trendCycle = 0;
      }

      // 获取多个时间段的交易记录进行分析
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);

      // 短期趋势（5分钟）
      const shortTermTrades = await this.prisma.trade.findMany({
        where: { executedAt: { gte: fiveMinutesAgo } },
        orderBy: { executedAt: 'desc' },
        take: 20,
        select: { price: true, executedAt: true },
      });

      // 中期趋势（15分钟）
      const mediumTermTrades = await this.prisma.trade.findMany({
        where: { executedAt: { gte: fifteenMinutesAgo } },
        orderBy: { executedAt: 'desc' },
        take: 40,
        select: { price: true, executedAt: true },
      });

      // 长期趋势（30分钟）
      const longTermTrades = await this.prisma.trade.findMany({
        where: { executedAt: { gte: thirtyMinutesAgo } },
        orderBy: { executedAt: 'desc' },
        take: 60,
        select: { price: true, executedAt: true },
      });

      if (shortTermTrades.length < 5) return;

      // 计算不同时间段的价格变化
      const shortTermChange = this.calculatePriceChange(shortTermTrades);
      const mediumTermChange = this.calculatePriceChange(mediumTermTrades);
      const longTermChange = this.calculatePriceChange(longTermTrades);

      // 综合分析趋势，权重：短期30%，中期40%，长期30%
      const weightedTrendChange =
        shortTermChange * 0.3 + mediumTermChange * 0.4 + longTermChange * 0.3;

      // 动态调整市场趋势偏向，创建更真实的波动
      let trendAdjustment = 0;

      if (weightedTrendChange < -0.08) {
        // 显著下跌：强力反弹
        trendAdjustment = 0.25;
        await this.executeTrendCorrection(true, 6);
        this.logger.log(
          `检测到显著下跌${(Math.abs(weightedTrendChange) * 100).toFixed(
            2
          )}%，执行强力反弹`
        );
      } else if (weightedTrendChange < -0.04) {
        // 中度下跌：适度反弹
        trendAdjustment = 0.15;
        await this.executeTrendCorrection(true, 3);
      } else if (weightedTrendChange > 0.12) {
        // 显著上涨：强力回调
        trendAdjustment = -0.2;
        await this.executeTrendCorrection(false, 4);
        this.logger.log(
          `检测到显著上涨${(weightedTrendChange * 100).toFixed(2)}%，执行回调`
        );
      } else if (weightedTrendChange > 0.06) {
        // 中度上涨：适度回调
        trendAdjustment = -0.1;
        await this.executeTrendCorrection(false, 2);
      } else if (weightedTrendChange > 0.02) {
        // 温和上涨：轻微回调
        trendAdjustment = -0.05;
      } else if (weightedTrendChange < -0.02) {
        // 温和下跌：轻微反弹
        trendAdjustment = 0.08;
      } else {
        // 横盘整理：随机小幅波动
        trendAdjustment = (Math.random() - 0.5) * 0.1;
      }

      // 应用趋势调整
      this.marketTrendBias += trendAdjustment;

      // 添加周期性波动，防止单调趋势
      const cyclicAdjustment = Math.sin(this.trendCycle * 0.5) * 0.03;
      this.marketTrendBias += cyclicAdjustment;

      // 限制marketTrendBias在合理范围内
      this.marketTrendBias = Math.max(
        -0.25,
        Math.min(0.35, this.marketTrendBias)
      );

      this.logger.log(
        `趋势分析 - 短期:${(shortTermChange * 100).toFixed(1)}% 中期:${(
          mediumTermChange * 100
        ).toFixed(1)}% 长期:${(longTermChange * 100).toFixed(
          1
        )}% 偏向:${this.marketTrendBias.toFixed(3)}`
      );
    } catch (error) {
      this.logger.error('长期趋势检查失败:', error);
    }
  }

  /** 计算价格变化百分比 */
  private calculatePriceChange(trades: { price: any }[]): number {
    if (trades.length < 2) return 0;
    const prices = trades.map((trade) => trade.price.toNumber());
    const latestPrice = prices[0];
    const earliestPrice = prices[prices.length - 1];
    return (latestPrice - earliestPrice) / earliestPrice;
  }

  /** 执行趋势修正交易 */
  private async executeTrendCorrection(
    isBuyCorrection: boolean,
    tradeCount: number
  ) {
    try {
      // 随机选择机器人执行修正交易
      const selectedBots = this.botUsers
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(tradeCount, this.botUsers.length));

      const currentPrice = await this.getCurrentMarketPrice();

      for (const botUserId of selectedBots) {
        const orderType = isBuyCorrection ? OrderType.BUY : OrderType.SELL;
        await this.placeLiquidityOrderWithLock(botUserId, orderType, currentPrice);

        // 间隔一小段时间，避免同时下单
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      this.logger.error('执行趋势修正交易失败:', error);
    }
  }

  /** 更新市场情绪 */
  private async updateMarketSentiment() {
    try {
      // 获取最近的交易数据来分析市场情绪
      const recentTrades = await this.prisma.trade.findMany({
        orderBy: { executedAt: 'desc' },
        take: 30,
        select: { price: true, quantity: true, executedAt: true },
      });

      if (recentTrades.length < 10) return;

      // 计算价格波动性和交易量
      const prices = recentTrades.map((trade) => trade.price.toNumber());
      const volumes = recentTrades.map((trade) => trade.quantity);

      // 计算价格标准差（波动性指标）
      const avgPrice =
        prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const priceVariance =
        prices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) /
        prices.length;
      const priceStdDev = Math.sqrt(priceVariance);
      const volatilityRatio = priceStdDev / avgPrice;

      // 计算平均交易量
      const avgVolume =
        volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;

      // 计算价格趋势
      const priceChange = this.calculatePriceChange(recentTrades);

      // 基于多个因素更新市场情绪
      let sentimentChange = 0;

      // 价格趋势影响情绪
      if (priceChange > 0.05) {
        sentimentChange += 0.3; // 大涨提升情绪
      } else if (priceChange > 0.02) {
        sentimentChange += 0.15; // 小涨轻微提升
      } else if (priceChange < -0.05) {
        sentimentChange -= 0.3; // 大跌降低情绪
      } else if (priceChange < -0.02) {
        sentimentChange -= 0.15; // 小跌轻微降低
      }

      // 波动性影响情绪（高波动性通常降低情绪）
      if (volatilityRatio > 0.03) {
        sentimentChange -= 0.2;
      } else if (volatilityRatio < 0.01) {
        sentimentChange += 0.1; // 低波动性提升信心
      }

      // 交易量影响情绪
      if (avgVolume > 50) {
        sentimentChange += 0.1; // 高交易量提升情绪
      } else if (avgVolume < 20) {
        sentimentChange -= 0.1; // 低交易量降低情绪
      }

      // 添加随机因素，模拟市场情绪的不可预测性
      sentimentChange += (Math.random() - 0.5) * 0.2;

      // 应用情绪变化
      this.marketSentiment += sentimentChange;

      // 限制情绪在-1到1之间
      this.marketSentiment = Math.max(-1, Math.min(1, this.marketSentiment));

      // 情绪自然回归中性（防止极端情绪持续太久）
      this.marketSentiment *= 0.95;

      this.logger.log(
        `市场情绪更新 - 价格变化:${(priceChange * 100).toFixed(1)}% 波动率:${(
          volatilityRatio * 100
        ).toFixed(2)}% 情绪:${this.marketSentiment.toFixed(3)}`
      );
    } catch (error) {
      this.logger.error('更新市场情绪失败:', error);
    }
  }

  /** 更新波动性倍数 */
  private async updateVolatility() {
    try {
      // 获取最近的交易数据
      const recentTrades = await this.prisma.trade.findMany({
        orderBy: { executedAt: 'desc' },
        take: 20,
        select: { price: true, executedAt: true },
      });

      if (recentTrades.length < 5) return;

      // 计算最近的价格波动
      const prices = recentTrades.map((trade) => trade.price.toNumber());
      const avgPrice =
        prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const priceVariance =
        prices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) /
        prices.length;
      const currentVolatility = Math.sqrt(priceVariance) / avgPrice;

      // 基于当前波动性和市场情绪调整波动性倍数
      let targetVolatility = 1.0;

      // 市场情绪影响波动性
      if (Math.abs(this.marketSentiment) > 0.7) {
        targetVolatility = 1.5; // 极端情绪增加波动性
      } else if (Math.abs(this.marketSentiment) > 0.4) {
        targetVolatility = 1.2; // 中等情绪适度增加波动性
      } else {
        targetVolatility = 0.8; // 平静情绪降低波动性
      }

      // 当前波动性影响
      if (currentVolatility > 0.03) {
        targetVolatility *= 0.7; // 已经高波动时降低目标
      } else if (currentVolatility < 0.01) {
        targetVolatility *= 1.3; // 低波动时增加目标
      }

      // 添加随机因素
      targetVolatility *= 0.8 + Math.random() * 0.4; // 0.8-1.2倍随机调整

      // 平滑过渡到目标波动性
      this.volatilityMultiplier =
        this.volatilityMultiplier * 0.7 + targetVolatility * 0.3;

      // 限制波动性倍数在合理范围内
      this.volatilityMultiplier = Math.max(
        0.5,
        Math.min(2.0, this.volatilityMultiplier)
      );

      this.logger.log(
        `波动性更新 - 当前波动:${(currentVolatility * 100).toFixed(
          2
        )}% 倍数:${this.volatilityMultiplier.toFixed(3)}`
      );
    } catch (error) {
      this.logger.error('更新波动性失败:', error);
    }
  }

  /** 检查随机事件 */
  private async checkRandomEvents() {
    try {
      const now = Date.now();

      // 检查是否满足最小间隔要求
      if (now - this.lastRandomEventTime < this.MIN_RANDOM_EVENT_INTERVAL) {
        return;
      }

      // 检查是否触发随机事件
      if (Math.random() < this.RANDOM_EVENT_PROBABILITY) {
        await this.executeRandomEvent();
        this.lastRandomEventTime = now;
      }
    } catch (error) {
      this.logger.error('检查随机事件失败:', error);
    }
  }

  /** 执行随机事件 */
  private async executeRandomEvent() {
    try {
      const currentPrice = await this.getCurrentMarketPrice();

      // 随机事件类型
      const eventTypes = [
        'positive_news', // 利好消息
        'negative_news', // 利空消息
        'volume_spike', // 交易量激增
        'whale_trade', // 大户交易
        'market_shock', // 市场震荡
      ];

      const eventType =
        eventTypes[Math.floor(Math.random() * eventTypes.length)];

      switch (eventType) {
        case 'positive_news':
          // 利好消息：价格突然上涨
          await this.executeNewsEvent(true, 0.05, 0.15, 8);
          this.logger.log('随机事件：利好消息发布，价格上涨');
          break;

        case 'negative_news':
          // 利空消息：价格突然下跌
          await this.executeNewsEvent(false, 0.03, 0.12, 6);
          this.logger.log('随机事件：利空消息发布，价格下跌');
          break;

        case 'volume_spike':
          // 交易量激增：大量订单
          await this.executeVolumeSpike(12);
          this.logger.log('随机事件：交易量激增');
          break;

        case 'whale_trade':
          // 大户交易：单笔大额订单
          await this.executeWhaleTradeEvent();
          this.logger.log('随机事件：大户交易');
          break;

        case 'market_shock':
          // 市场震荡：短期高波动
          await this.executeMarketShock();
          this.logger.log('随机事件：市场震荡');
          break;
      }
    } catch (error) {
      this.logger.error('执行随机事件失败:', error);
    }
  }

  /** 执行新闻事件 */
  private async executeNewsEvent(
    isPositive: boolean,
    minImpact: number,
    maxImpact: number,
    tradeCount: number
  ) {
    // 临时调整市场情绪和趋势偏向
    const originalSentiment = this.marketSentiment;
    const originalTrendBias = this.marketTrendBias;

    const impact = minImpact + Math.random() * (maxImpact - minImpact);

    if (isPositive) {
      this.marketSentiment = Math.min(1, this.marketSentiment + impact * 2);
      this.marketTrendBias += impact;
    } else {
      this.marketSentiment = Math.max(-1, this.marketSentiment - impact * 2);
      this.marketTrendBias -= impact;
    }

    // 执行相应的交易
    await this.executeTrendCorrection(isPositive, tradeCount);

    // 30秒后逐渐恢复
    setTimeout(() => {
      this.marketSentiment = originalSentiment;
      this.marketTrendBias = originalTrendBias;
    }, 30000);
  }

  /** 执行交易量激增事件 */
  private async executeVolumeSpike(tradeCount: number) {
    const currentPrice = await this.getCurrentMarketPrice();

    // 随机选择机器人执行大量交易
    const selectedBots = this.botUsers
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(tradeCount, this.botUsers.length));

    for (const botUserId of selectedBots) {
      const orderType = Math.random() < 0.5 ? OrderType.BUY : OrderType.SELL;
      await this.placeLiquidityOrderWithLock(botUserId, orderType, currentPrice);

      // 短间隔下单，模拟激增
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** 执行大户交易事件 */
  private async executeWhaleTradeEvent() {
    const currentPrice = await this.getCurrentMarketPrice();
    const randomBot =
      this.botUsers[Math.floor(Math.random() * this.botUsers.length)];

    // 大额订单（正常订单的5-10倍）
    const orderType = Math.random() < 0.5 ? OrderType.BUY : OrderType.SELL;
    const largeQuantity = Math.floor(Math.random() * 500) + 200; // 200-700股

    try {
      await this.orderService.createOrder(
        randomBot,
        'AAPL',
        orderType,
        OrderMethod.MARKET,
        currentPrice,
        largeQuantity
      );
    } catch (error) {
      this.logger.error('执行大户交易失败:', error);
    }
  }

  /** 执行市场震荡事件 */
  private async executeMarketShock() {
    // 临时大幅增加波动性
    const originalVolatility = this.volatilityMultiplier;
    this.volatilityMultiplier = Math.min(2.0, this.volatilityMultiplier * 1.8);

    // 执行多轮快速交易
    for (let i = 0; i < 5; i++) {
      await this.executeTrendCorrection(Math.random() < 0.5, 3);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 2分钟后恢复正常波动性
    setTimeout(() => {
      this.volatilityMultiplier = originalVolatility;
    }, 120000);
  }
}
