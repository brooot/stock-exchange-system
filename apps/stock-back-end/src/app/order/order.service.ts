import { TradeService } from './../trade/trade.service';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { PositionService } from '../position/position.service';
import { MarketGateway } from '../websocket/market.gateway';
import { QueueService, BatchTradeProcessingData } from '../queue/queue.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { OrderType, OrderMethod, OrderStatus, Trade } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { SnowflakeService } from '../snowflake/snowflake.service';
import { NegativeDetectionService } from '../common/negative-detection.service';

@Injectable()
export class OrderService {
  // 缓存上一次的市场价格，避免重复广播相同价格
  private lastMarketPrices: Map<string, number> = new Map();

  constructor(
    private prisma: PrismaService,
    private userService: UserService,
    private positionService: PositionService,
    private marketGateway: MarketGateway,
    private queueService: QueueService,
    private snowflakeService: SnowflakeService,
    private negativeDetectionService: NegativeDetectionService,
    private tradeService: TradeService,
    @InjectQueue('order-processing') private orderQueue: Queue,
    @InjectQueue('trade-processing') private tradeQueue: Queue
  ) {}

  /** 推入订单创建队列 */
  async pushIntoOrderQueue(
    userId: number,
    symbol: string,
    type: OrderType,
    method: OrderMethod,
    price: number | undefined,
    quantity: number
  ) {
    console.log(
      `[订单创建] 用户${userId} 开始创建订单 - ` +
        `类型: ${type}, 方法: ${method}, 股票: ${symbol}, ` +
        `价格: ${price ? price.toFixed(2) : '市价'}, 数量: ${quantity}`
    );

    // 验证输入
    this.validateOrderInput(method, price, quantity);

    // 获取用户当前状态
    const userBefore = await this.userService.findById(userId);
    const positionBefore = await this.userService.getUserPosition(
      userId,
      symbol
    );

    console.log(
      `[订单创建] 用户${userId} 冻结前状态 - ` +
        `余额: ${userBefore.balance
          .toNumber()
          .toFixed(2)}, 冻结余额: ${userBefore.frozenBalance
          .toNumber()
          .toFixed(2)}, ` +
        `持仓: ${positionBefore?.quantity || 0}, 冻结持仓: ${
          positionBefore?.frozenQuantity || 0
        }`
    );

    // 计算所需资金并验证用户资源
    const requiredAmount = await this.calculateRequiredAmount(
      userId,
      type,
      method,
      price,
      quantity
    );

    try {
      await this.validateUserResources(
        userId,
        symbol,
        type,
        method,
        quantity,
        requiredAmount
      );
    } catch (error) {
      console.error(
        `[订单创建] 用户${userId} 资源验证失败 - 错误: ${error.message}`
      );
      throw error;
    }

    // 生成订单ID用于追踪
    const orderId = this.snowflakeService.generateId();

    // 添加到队列进行异步处理（不在这里创建订单）
    const priority = method === OrderMethod.MARKET ? 10 : 0; // 市价单优先级更高
    await this.orderQueue.add(
      'process-order',
      {
        userId,
        symbol,
        type,
        method,
        price,
        quantity,
        orderId,
        timestamp: Date.now(),
      },
      { priority }
    );

    return {
      id: orderId,
      status: 'PENDING', // 订单已提交，等待处理
      message: '订单已提交，正在处理中',
    };
  }

  /** 同步订单处理 - 用于队列处理器调用 */
  async createOrderSync(
    userId: number,
    symbol: string,
    type: OrderType,
    method: OrderMethod,
    price: number | undefined,
    quantity: number,
    orderId?: string
  ) {
    // 验证输入 - 市价单可以不传price
    this.validateOrderInput(method, price, quantity);

    // 计算所需资金并验证用户资源
    const requiredAmount = await this.calculateRequiredAmount(
      userId,
      type,
      method,
      price,
      quantity
    );
    await this.validateUserResources(
      userId,
      symbol,
      type,
      method,
      quantity,
      requiredAmount
    );

    // 创建订单，处理ID冲突，并立即冻结资金/持仓
    const finalOrderId = orderId || this.snowflakeService.generateId();
    // const maxRetries = 5; // 增加重试次数

    // 使用事务确保订单创建和资金/持仓冻结的原子性
    const order = await this.prisma.$transaction(async (tx) => {
      // let createdOrder;
      const currentOrderId = finalOrderId;
      // const currentRetryCount = 0;

      // 在事务内处理ID冲突重试
      // while (currentRetryCount < maxRetries) {
      // try {
      const createdOrder = await tx.order.create({
        data: {
          id: currentOrderId,
          userId,
          symbol,
          type,
          method,
          price: method === OrderMethod.MARKET ? null : new Decimal(price),
          quantity,
          status: OrderStatus.OPEN,
        },
      });
      // break; // 成功创建，跳出循环
      // } catch (error) {
      // if (error.code === 'P2002' && error.meta?.target?.includes('id')) {
      //   // ID冲突，生成新的ID重试
      //   currentOrderId = this.snowflakeService.generateId();
      //   currentRetryCount++;
      //   if (currentRetryCount >= maxRetries) {
      //     throw new Error(
      //       `订单创建失败：ID冲突重试${maxRetries}次后仍然失败`
      //     );
      //   }
      //   // 添加短暂延迟，避免连续冲突
      //   await new Promise((resolve) =>
      //     setTimeout(resolve, Math.random() * 10)
      //   );
      // } else {
      // 其他错误直接抛出
      // throw error;
      // }
      // }
      // }

      if (!createdOrder) {
        throw new Error('订单创建失败：未知错误');
      }

      // 订单创建成功后，立即冻结资金或持仓
      if (type === OrderType.BUY) {
        // 买单：冻结资金
        console.log(
          `[订单创建事务] 用户${userId} 订单${currentOrderId} 开始冻结资金 - 金额: ${requiredAmount.toFixed(
            2
          )}`
        );

        const userBeforeUpdate = await tx.user.findUnique({
          where: { id: userId },
          select: { balance: true, frozenBalance: true },
        });

        // 冻结买家用户资金
        await this.userService.freezeBalance(userId, requiredAmount, tx);

        const userAfterUpdate = await tx.user.findUnique({
          where: { id: userId },
          select: { balance: true, frozenBalance: true },
        });

        console.log(
          `[订单创建事务] 用户${userId} 资金冻结完成 - ` +
            `冻结前: 余额${userBeforeUpdate.balance
              .toNumber()
              .toFixed(2)}, 冻结${userBeforeUpdate.frozenBalance
              .toNumber()
              .toFixed(2)}, ` +
            `冻结后: 余额${userAfterUpdate.balance
              .toNumber()
              .toFixed(2)}, 冻结${userAfterUpdate.frozenBalance
              .toNumber()
              .toFixed(2)}`
        );
      } else {
        // 卖单：冻结持仓
        console.log(
          `[订单创建事务] 用户${userId} 订单${currentOrderId} 开始冻结持仓 - 股票: ${symbol}, 数量: ${quantity}`
        );

        const positionBeforeUpdate = await tx.position.findUnique({
          where: { userId_symbol: { userId, symbol } },
          select: { quantity: true, frozenQuantity: true },
        });

        // 使用 userService 的 freezePositionWithTx 方法来确保逻辑一致性
        await this.userService.freezePositionWithTx(
          userId,
          symbol,
          quantity,
          tx
        );
        // freezePositionWithTx 方法会在持仓不足时直接抛出异常，无需检查 result.count

        const positionAfterUpdate = await tx.position.findUnique({
          where: { userId_symbol: { userId, symbol } },
          select: { quantity: true, frozenQuantity: true },
        });

        console.log(
          `[订单创建事务] 用户${userId} 持仓冻结完成 - ` +
            `冻结前: 持仓${positionBeforeUpdate?.quantity || 0}, 冻结${
              positionBeforeUpdate?.frozenQuantity || 0
            }, ` +
            `冻结后: 持仓${positionAfterUpdate?.quantity || 0}, 冻结${
              positionAfterUpdate?.frozenQuantity || 0
            }`
        );
      }

      return createdOrder;
    });

    if (!order) {
      throw new Error('订单创建失败：未知错误');
    }

    // 尝试撮合
    const matchResult = await this.matchOrder(order);

    // 🔧 修复市价订单状态更新问题：将matchOrder返回的finalStatus更新到数据库
    if (matchResult.finalStatus !== order.status) {
      console.log(
        `[订单状态更新] 订单${order.id} 状态从 ${order.status} 更新为 ${matchResult.finalStatus}`
      );

      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: matchResult.finalStatus,
          filledQuantity: matchResult.filledQuantity,
        },
      });
    }

    return {
      id: order.id,
      status: matchResult.finalStatus,
      filledQty: matchResult.filledQuantity,
    };
  }

  /** 取消订单 */
  async cancelOrder(orderId: string, userId: number) {
    console.log(`[订单取消] 用户${userId} 开始取消订单${orderId}`);

    // 查找订单
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      console.error(`[订单取消] 订单${orderId}不存在`);
      throw new NotFoundException('订单不存在');
    }

    if (order.userId !== userId) {
      console.error(`[订单取消] 用户${userId}无权限取消订单${orderId}`);
      throw new ForbiddenException('无权限取消此订单');
    }

    console.log(
      `[订单取消] 找到订单${orderId} - ` +
        `类型: ${order.type}, 股票: ${order.symbol}, ` +
        `价格: ${order.price.toNumber().toFixed(2)}, 数量: ${
          order.quantity
        }, ` +
        `已成交: ${order.filledQuantity}, 状态: ${order.status}`
    );

    // 如果订单已经是取消或完成状态，直接返回成功
    if (order.status === OrderStatus.CANCELLED) {
      console.log(`[订单取消] 订单${orderId}已经是取消状态`);
      return { success: true, message: '订单已经是取消状态' };
    }

    if (order.status === OrderStatus.FILLED) {
      console.log(`[订单取消] 订单${orderId}已完全成交，无需取消`);
      return { success: true, message: '订单已完全成交，无需取消' };
    }

    // 只有OPEN和PARTIALLY_FILLED状态的订单才需要真正取消
    if (
      order.status !== OrderStatus.OPEN &&
      order.status !== OrderStatus.PARTIALLY_FILLED
    ) {
      console.error(`[订单取消] 订单${orderId}状态${order.status}不允许取消`);
      throw new BadRequestException(`订单状态${order.status}不允许取消`);
    }

    // 计算需要解冻的数量（未成交部分）
    const unfilledQuantity = order.quantity - order.filledQuantity;

    // 🔧 修复买单解冻金额计算问题
    let unfilledAmount: number;
    if (order.type === OrderType.BUY) {
      if (order.method === OrderMethod.MARKET) {
        // 市价买单：解冻金额应该是当前实际冻结的金额，而不是基于价格计算
        // 因为市价买单创建时冻结的是全部可用资金，而不是基于价格的计算金额
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { frozenBalance: true },
        });
        unfilledAmount = user?.frozenBalance?.toNumber() || 0;
        console.log(
          `[订单取消] 市价买单${orderId} 解冻全部冻结资金: ${unfilledAmount.toFixed(
            2
          )}`
        );
      } else {
        // 限价买单：需要考虑部分成交情况下的实际冻结金额
        // 对于部分成交的限价买单，实际冻结的金额可能已经因为成交而减少
        // 我们需要基于当前实际冻结余额来计算解冻金额，而不是简单的价格乘以未成交数量
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { frozenBalance: true },
        });
        const currentFrozenBalance = user?.frozenBalance?.toNumber() || 0;
        const theoreticalUnfilledAmount = order.price.toNumber() * unfilledQuantity;
        
        // 解冻金额不能超过当前实际冻结的余额
        // 这样可以避免在多订单场景下错误解冻其他订单的资金
        unfilledAmount = Math.min(theoreticalUnfilledAmount, currentFrozenBalance);
        
        console.log(
          `[订单取消] 限价买单${orderId} 解冻计算 - ` +
          `理论解冻金额: ${theoreticalUnfilledAmount.toFixed(2)}, ` +
          `当前冻结余额: ${currentFrozenBalance.toFixed(2)}, ` +
          `实际解冻金额: ${unfilledAmount.toFixed(2)}`
        );
      }
    } else {
      // 卖单：使用价格计算（卖单逻辑相对简单，因为冻结的是具体数量的股票）
      unfilledAmount = order.price.toNumber() * unfilledQuantity;
    }

    console.log(
      `[订单取消] 订单${orderId} 计算解冻量 - ` +
        `未成交数量: ${unfilledQuantity}, 未成交金额: ${unfilledAmount.toFixed(
          2
        )} (${
          order.method === OrderMethod.MARKET && order.type === OrderType.BUY
            ? '市价买单-全部冻结资金'
            : '基于价格计算'
        })`
    );

    // 在事务中更新订单状态并解冻资金/股票
    await this.prisma.$transaction(async (prisma) => {
      // 更新订单状态
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      console.log(`[订单取消] 订单${orderId} 状态已更新为CANCELLED`);

      // 解冻相应的资金或股票 - 直接在事务内执行，避免嵌套事务
      if (order.type === OrderType.BUY) {
        // 买单：解冻资金
        if (unfilledAmount > 0) {
          console.log(
            `[订单取消] 订单${orderId} 开始解冻资金 - 金额: ${unfilledAmount.toFixed(
              2
            )}`
          );

          // 先查询实际冻结余额
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { frozenBalance: true },
          });

          const frozenBalance = user?.frozenBalance || 0;
          const actualFrozenAmount = Math.min(
            unfilledAmount,
            typeof frozenBalance === 'number'
              ? frozenBalance
              : (frozenBalance as any).toNumber()
          );

          console.log(
            `[订单取消] 订单${orderId} 实际解冻金额: ${actualFrozenAmount.toFixed(
              2
            )}, ` +
              `当前冻结余额: ${
                typeof frozenBalance === 'number'
                  ? frozenBalance.toFixed(2)
                  : frozenBalance.toNumber().toFixed(2)
              }`
          );

          if (actualFrozenAmount > 0) {
            const userBeforeUnfreeze = await prisma.user.findUnique({
              where: { id: userId },
              select: { balance: true, frozenBalance: true },
            });

            await this.userService.unfreezeBalance(
              userId,
              actualFrozenAmount,
              prisma
            );

            const userAfterUnfreeze = await prisma.user.findUnique({
              where: { id: userId },
              select: { balance: true, frozenBalance: true },
            });

            console.log(
              `[订单取消] 订单${orderId} 资金解冻完成 - ` +
                `解冻前: 余额${userBeforeUnfreeze.balance
                  .toNumber()
                  .toFixed(2)}, 冻结${userBeforeUnfreeze.frozenBalance
                  .toNumber()
                  .toFixed(2)}, ` +
                `解冻后: 余额${userAfterUnfreeze.balance
                  .toNumber()
                  .toFixed(2)}, 冻结${userAfterUnfreeze.frozenBalance
                  .toNumber()
                  .toFixed(2)}`
            );
          }
        }
      } else {
        // 卖单：解冻股票
        if (unfilledQuantity > 0) {
          console.log(
            `[订单取消] 订单${orderId} 开始解冻持仓 - 股票: ${order.symbol}, 数量: ${unfilledQuantity}`
          );

          // 先查询实际冻结持仓
          const position = await prisma.position.findUnique({
            where: {
              userId_symbol: {
                userId,
                symbol: order.symbol,
              },
            },
            select: { frozenQuantity: true },
          });

          const frozenQty = position?.frozenQuantity || 0;
          const actualFrozenQuantity = Math.min(
            unfilledQuantity,
            typeof frozenQty === 'number'
              ? frozenQty
              : (frozenQty as any).toNumber()
          );

          console.log(
            `[订单取消] 订单${orderId} 实际解冻持仓: ${actualFrozenQuantity}, ` +
              `当前冻结持仓: ${
                typeof frozenQty === 'number' ? frozenQty : Number(frozenQty)
              }`
          );

          if (actualFrozenQuantity > 0) {
            const positionBeforeUnfreeze = await prisma.position.findUnique({
              where: { userId_symbol: { userId, symbol: order.symbol } },
              select: { quantity: true, frozenQuantity: true },
            });

            // 使用统一的持仓解冻方法
            await this.userService.adjustFrozenQuantity(
              userId,
              order.symbol,
              -actualFrozenQuantity,
              prisma
            );

            const positionAfterUnfreeze = await prisma.position.findUnique({
              where: { userId_symbol: { userId, symbol: order.symbol } },
              select: { quantity: true, frozenQuantity: true },
            });

            console.log(
              `[订单取消] 订单${orderId} 持仓解冻完成 - ` +
                `解冻前: 持仓${positionBeforeUnfreeze?.quantity || 0}, 冻结${
                  positionBeforeUnfreeze?.frozenQuantity || 0
                }, ` +
                `解冻后: 持仓${positionAfterUnfreeze?.quantity || 0}, 冻结${
                  positionAfterUnfreeze?.frozenQuantity || 0
                }`
            );
          }
        }
      }
    });

    console.log(`[订单取消] 订单${orderId} 取消完成`);
    return { success: true };
  }

  // 优化的撮合引擎
  private async matchOrder(newOrder: any) {
    console.log(
      `[撮合引擎] 开始撮合订单${newOrder.id} - ` +
        `用户${newOrder.userId}, 类型: ${newOrder.type}, 方法: ${newOrder.method}, ` +
        `股票: ${newOrder.symbol}, 价格: ${
          newOrder.price ? newOrder.price.toNumber().toFixed(2) : '市价'
        }, 数量: ${newOrder.quantity}`
    );

    const oppositeType =
      newOrder.type === OrderType.BUY ? OrderType.SELL : OrderType.BUY;
    let filledQuantity = 0;
    let remainingQuantity = newOrder.quantity;
    const symbol = newOrder.symbol;
    interface TradeInfo {
      trade: Trade;
      price: number;
      quantity: number;
      symbol: string;
      buyOrderId?: string;
      sellOrderId?: string;
    }

    const trades: TradeInfo[] = [];

    // 查找对手盘订单
    const whereCondition: any = {
      symbol, // 同一股票代码
      type: oppositeType,
      status: { in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] },
      userId: { not: newOrder.userId }, // 严格禁止自成交
    };

    // 市价单忽略价格限制，限价单需要价格匹配
    // 注意：市价单撮合后剩余部分会自动取消，因此不会作为对手盘存在
    if (newOrder.method === OrderMethod.LIMIT) {
      whereCondition.price = {
        // 买单找卖单：价格小于等于
        // 卖单找买单：价格大于等于
        [newOrder.type === OrderType.BUY ? 'lte' : 'gte']: newOrder.price,
      };
    }

    // 构建排序条件：按价格优先原则排序，然后按时间排序
    // 注意：由于市价单撮合后会自动取消，这里只需要处理限价单的排序
    const orderBy: any[] = [];

    // 买单找卖单：价格升序
    // 卖单找买单：价格降序
    orderBy.push({ price: newOrder.type === OrderType.BUY ? 'asc' : 'desc' });

    // 时间先来后到
    orderBy.push({ createdAt: 'asc' });

    const oppositeOrders = await this.prisma.order.findMany({
      where: whereCondition,
      orderBy,
    });

    console.log(
      `[撮合引擎] 订单${newOrder.id} 找到${oppositeOrders.length}个对手盘订单 - ` +
        `寻找类型: ${oppositeType}, 价格条件: ${JSON.stringify(
          whereCondition || '无限制'
        )}, 排序: ${JSON.stringify(orderBy)}`
    );

    if (oppositeOrders.length > 0) {
      console.log(
        `[撮合引擎] 对手盘订单详情: ${oppositeOrders
          .map(
            (o) =>
              `订单${o.id}(用户${o.userId}, 价格${
                o.price?.toNumber()?.toFixed(2) || '市价'
              }, 剩余${o.quantity - o.filledQuantity})`
          )
          .join(', ')}`
      );
    }

    // 使用数据库事务执行撮合，包含重试机制
    const result = await this.executeWithRetry(async () => {
      return await this.prisma.$transaction(async (prisma) => {
        // 跟踪事务内的持仓变化
        const positionChanges = new Map<number, number>();

        // 跟踪新订单在多轮撮合中的累计成交量和平均价格
        let newOrderCumulativeFilledQty = newOrder.filledQuantity;
        let newOrderCumulativeAvgPrice =
          newOrder.avgFilledPrice?.toNumber() || 0;

        // 执行撮合
        for (const oppositeOrder of oppositeOrders) {
          if (remainingQuantity === 0) {
            console.log(`[撮合引擎] 订单${newOrder.id} 已完全成交，停止撮合`);
            break;
          }
          if (remainingQuantity < 0) {
            throw new Error('订单数量不足');
          }

          const availableQuantity =
            oppositeOrder.quantity - oppositeOrder.filledQuantity;
          if (availableQuantity <= 0) {
            console.log(
              `[撮合引擎] 对手盘订单${oppositeOrder.id} 无可用数量，跳过`
            );
            continue;
          }

          console.log(
            `[撮合引擎] 尝试撮合 订单${newOrder.id} vs 订单${oppositeOrder.id} - ` +
              `剩余需求: ${remainingQuantity}, 对手可用: ${availableQuantity}`
          );

          // 当前最大可交易量
          let maxTradeQuantity = Math.min(remainingQuantity, availableQuantity);

          // 确定卖方用户ID和检查冻结持仓
          const sellerId =
            newOrder.type === 'SELL' ? newOrder.userId : oppositeOrder.userId;
          const sellerPosition = await this.positionService.getUserPosition(
            sellerId,
            symbol
          );
          // 卖方应该检查冻结持仓，因为卖单创建时已经冻结了持仓
          let availableFrozenPosition = sellerPosition
            ? sellerPosition.frozenQuantity
            : 0;

          // 考虑事务内已经发生的持仓变化（这里应该是冻结持仓的变化）
          const positionChange = positionChanges.get(sellerId) || 0;
          availableFrozenPosition += positionChange;

          maxTradeQuantity = Math.min(
            maxTradeQuantity,
            availableFrozenPosition
          );

          const tradeQuantity = maxTradeQuantity;

          // 如果没有可交易数量，跳过这个订单
          if (tradeQuantity <= 0) {
            console.log(
              `[撮合引擎] 订单${newOrder.id} vs 订单${oppositeOrder.id} 无可交易数量 - ` +
                `计算数量: ${maxTradeQuantity}, 冻结持仓: ${availableFrozenPosition}`
            );
            continue;
          }

          console.log(
            `[撮合引擎] 确定交易数量 - 订单${newOrder.id} vs 订单${oppositeOrder.id}, 数量: ${tradeQuantity}`
          );

          // 正确的成交价格计算：遵循价格优先和时间优先原则
          let tradePrice: number;

          // 处理市价单的成交价格
          if (
            newOrder.method === OrderMethod.MARKET &&
            oppositeOrder.method === OrderMethod.MARKET
          ) {
            // 双方都是市价单：使用最近交易价格或默认价格
            // 获取该交易对的最近交易价格
            const recentTrade = await prisma.trade.findFirst({
              where: {
                OR: [{ buyOrder: { symbol } }, { sellOrder: { symbol } }],
              },
              orderBy: { executedAt: 'desc' },
            });

            if (recentTrade) {
              tradePrice = recentTrade.price.toNumber();
            } else {
              // 如果没有历史交易，使用一个合理的默认价格（比如100）
              tradePrice = 150;
            }
          } else if (newOrder.method === OrderMethod.MARKET) {
            // 新订单是市价单，对手盘是限价单：使用对手盘价格
            tradePrice = oppositeOrder.price.toNumber();
          } else if (oppositeOrder.method === OrderMethod.MARKET) {
            // 新订单是限价单，对手盘是市价单：使用新订单价格
            tradePrice = newOrder.price.toNumber();
          } else {
            // 直接使用对手单价格，简单且符合交易所惯例
            tradePrice = oppositeOrder.price.toNumber();
          }
          tradePrice = Math.round(tradePrice * 100) / 100; // 保留2位小数

          console.log(
            `[撮合引擎] 确定成交价格 - 订单${newOrder.id} vs 订单${oppositeOrder.id}, ` +
              `成交价: ${tradePrice.toFixed(2)}, 成交量: ${tradeQuantity}, ` +
              `买方: ${
                newOrder.type === 'BUY' ? newOrder.userId : oppositeOrder.userId
              }, ` +
              `卖方: ${
                newOrder.type === 'SELL'
                  ? newOrder.userId
                  : oppositeOrder.userId
              }`
          );

          // 创建交易记录
          const trade = await prisma.trade.create({
            data: {
              buyOrderId:
                newOrder.type === 'BUY' ? newOrder.id : oppositeOrder.id,
              sellOrderId:
                newOrder.type === 'SELL' ? newOrder.id : oppositeOrder.id,
              price: tradePrice,
              quantity: tradeQuantity,
            },
          });

          console.log(`[撮合引擎] 创建交易记录${trade.id} 成功`);

          // 收集交易信息用于后续广播
          trades.push({
            trade,
            price: tradePrice,
            quantity: tradeQuantity,
            symbol,
          });

          // 更新订单状态
          const newOrderFilledQty = filledQuantity + tradeQuantity;
          const oppositeOrderFilledQty =
            oppositeOrder.filledQuantity + tradeQuantity;

          // 更新新订单
          const newOrderNewStatus =
            newOrderFilledQty >= newOrder.quantity
              ? OrderStatus.FILLED
              : OrderStatus.PARTIALLY_FILLED;

          // 计算新订单的平均成交价（使用累计变量确保多轮撮合的正确性）
          const newOrderNewAvgPrice =
            newOrderCumulativeFilledQty > 0
              ? Math.round(
                  ((newOrderCumulativeAvgPrice * newOrderCumulativeFilledQty +
                    tradePrice * tradeQuantity) /
                    newOrderFilledQty) *
                    100
                ) / 100
              : tradePrice;

          await prisma.order.update({
            where: { id: newOrder.id },
            data: {
              filledQuantity: newOrderFilledQty,
              status: newOrderNewStatus,
              avgFilledPrice: newOrderNewAvgPrice,
            },
          });

          console.log(
            `[撮合引擎] 更新订单${newOrder.id} - ` +
              `已成交: ${newOrderFilledQty}/${newOrder.quantity}, 状态: ${newOrderNewStatus}, ` +
              `平均价格: ${newOrderNewAvgPrice.toFixed(2)}`
          );

          // 更新累计变量供下一轮撮合使用
          newOrderCumulativeFilledQty = newOrderFilledQty;
          newOrderCumulativeAvgPrice = newOrderNewAvgPrice;

          // 更新对手订单
          const oppositeOrderNewStatus =
            oppositeOrderFilledQty >= oppositeOrder.quantity
              ? OrderStatus.FILLED
              : OrderStatus.PARTIALLY_FILLED;

          // 计算对手订单的平均成交价
          const oppositeOrderCurrentAvgPrice =
            oppositeOrder.avgFilledPrice?.toNumber() || 0;
          const oppositeOrderPreviousFilledQty = oppositeOrder.filledQuantity; // 对手订单使用数据库中的实际成交量
          const oppositeOrderNewAvgPrice =
            oppositeOrderPreviousFilledQty > 0
              ? Math.round(
                  ((oppositeOrderCurrentAvgPrice *
                    oppositeOrderPreviousFilledQty +
                    tradePrice * tradeQuantity) /
                    oppositeOrderFilledQty) *
                    100
                ) / 100
              : tradePrice;

          await prisma.order.update({
            where: { id: oppositeOrder.id },
            data: {
              filledQuantity: oppositeOrderFilledQty,
              status: oppositeOrderNewStatus,
              avgFilledPrice: oppositeOrderNewAvgPrice,
            },
          });

          console.log(
            `[撮合引擎] 更新订单${oppositeOrder.id} - ` +
              `已成交: ${oppositeOrderFilledQty}/${oppositeOrder.quantity}, 状态: ${oppositeOrderNewStatus}`
          );

          // 更新用户余额和持仓（传入事务实例避免嵌套事务）
          console.log(
            `[撮合引擎] 开始更新用户余额和持仓 - 交易${trade.id}, ` +
              `买方订单: ${
                newOrder.type === 'BUY' ? newOrder.id : oppositeOrder.id
              }, ` +
              `卖方订单: ${
                newOrder.type === 'SELL' ? newOrder.id : oppositeOrder.id
              }, ` +
              `价格: ${tradePrice.toFixed(2)}, 数量: ${tradeQuantity}`
          );

          await this.updateUserBalances(
            newOrder.type === 'BUY' ? newOrder : oppositeOrder,
            newOrder.type === 'SELL' ? newOrder : oppositeOrder,
            tradePrice,
            tradeQuantity,
            prisma, // 传入当前事务实例
            positionChanges
          );

          console.log(`[撮合引擎] 用户余额和持仓更新完成 - 交易${trade.id}`);

          filledQuantity += tradeQuantity;
          remainingQuantity -= tradeQuantity;

          console.log(
            `[撮合引擎] 订单${newOrder.id} 撮合进度 - ` +
              `已成交: ${filledQuantity} / ${remainingQuantity}`
          );
        }

        // 🔧 市价订单简化逻辑：如果有剩余未成交部分，直接取消而不是设置为部分成交
        let finalStatus: OrderStatus;
        if (filledQuantity >= newOrder.quantity) {
          // 完全成交
          finalStatus = OrderStatus.FILLED;
        } else if (filledQuantity > 0) {
          // 部分成交
          if (newOrder.method === OrderMethod.MARKET) {
            // 对于市价订单，如果有剩余未成交部分，直接取消
            finalStatus = OrderStatus.CANCELLED;
            console.log(
              `[撮合引擎] 市价订单${newOrder.id} 有剩余未成交部分 (剩余: ${remainingQuantity}), 自动取消订单`
            );

            // 🔧 处理市价订单取消时的资金和持仓解冻
            if (newOrder.type === OrderType.BUY) {
              // 市价买单：解冻剩余的冻结资金
              const currentUser = await prisma.user.findUnique({
                where: { id: newOrder.userId },
                select: { frozenBalance: true },
              });
              const remainingFrozen =
                currentUser?.frozenBalance?.toNumber() || 0;
              if (remainingFrozen > 0) {
                console.log(
                  `[撮合引擎] 市价买单${
                    newOrder.id
                  }取消，解冻剩余资金 ${remainingFrozen.toFixed(2)}`
                );
                await this.userService.unfreezeBalance(
                  newOrder.userId,
                  remainingFrozen,
                  prisma
                );
              }
            } else {
              // 市价卖单：解冻剩余的冻结持仓
              const remainingQuantity = newOrder.quantity - filledQuantity;
              if (remainingQuantity > 0) {
                console.log(
                  `[撮合引擎] 市价卖单${newOrder.id}取消，解冻剩余持仓 ${remainingQuantity} 股`
                );
                // 使用统一的持仓解冻方法
                await this.userService.adjustFrozenQuantity(
                  newOrder.userId,
                  newOrder.symbol,
                  -remainingQuantity,
                  prisma
                );
              }
            }
          } else {
            // 限价订单保持原有逻辑
            finalStatus = OrderStatus.PARTIALLY_FILLED;
          }
        } else {
          finalStatus = OrderStatus.OPEN;
        }

        return {
          filledQuantity,
          finalStatus,
          trades,
        };
      });
    });

    // 事务完成后批量处理交易广播
    if (result.trades.length > 0) {
      // 批量添加交易到处理队列，避免重复广播
      const batchTradeData: BatchTradeProcessingData = {
        trades: result.trades.map((tradeInfo) => ({
          id: tradeInfo.trade.id,
          buyOrderId: tradeInfo.trade.buyOrderId,
          sellOrderId: tradeInfo.trade.sellOrderId,
          price: tradeInfo.trade.price.toNumber(),
          quantity: tradeInfo.trade.quantity,
        })),
        symbol,
        totalVolume: result.filledQuantity,
        timestamp: Date.now(),
      };

      // 添加批量交易处理到队列
      await this.queueService.addBatchTradeProcessing(batchTradeData);
    }

    return {
      filledQuantity: result.filledQuantity,
      finalStatus: result.finalStatus,
    };
  }

  /** 更新用户持仓 */
  private async updateUserBalances(
    buyOrder: any,
    sellOrder: any,
    price: number, // 交易价格
    quantity: number, // 交易证券数量
    prisma: any, // 传入事务实例
    positionChanges?: Map<number, number>
  ) {
    const tradeAmount = price * quantity;
    const symbol = buyOrder.symbol || sellOrder.symbol;
    const db = prisma; // 使用传入的事务实例

    console.log(
      `[余额更新] 开始处理交易 - 买方: ${buyOrder.userId}, 卖方: ${sellOrder.userId}, ` +
        `股票: ${symbol}, 价格: ${price.toFixed(
          2
        )}, 数量: ${quantity}, 总金额: ${tradeAmount.toFixed(2)}`
    );

    // 获取更新前的用户状态
    const buyerBefore = await db.user.findUnique({
      where: { id: buyOrder.userId },
      select: { balance: true, frozenBalance: true },
    });

    const sellerBefore = await db.user.findUnique({
      where: { id: sellOrder.userId },
      select: { balance: true, frozenBalance: true },
    });

    const buyerPositionBefore = await db.position.findUnique({
      where: { userId_symbol: { userId: buyOrder.userId, symbol } },
      select: { quantity: true, frozenQuantity: true, avgPrice: true },
    });

    const sellerPositionBefore = await db.position.findUnique({
      where: { userId_symbol: { userId: sellOrder.userId, symbol } },
      select: { quantity: true, frozenQuantity: true, avgPrice: true },
    });

    console.log(
      `[余额更新] 更新前状态 - ` +
        `买方${buyOrder.userId}: 余额${
          buyerBefore?.balance?.toNumber()?.toFixed(2) || '0'
        }, ` +
        `冻结${buyerBefore?.frozenBalance?.toNumber()?.toFixed(2) || '0'}, ` +
        `持仓${buyerPositionBefore?.quantity || 0}, 冻结持仓${
          buyerPositionBefore?.frozenQuantity || 0
        }; ` +
        `卖方${sellOrder.userId}: 余额${
          sellerBefore?.balance?.toNumber()?.toFixed(2) || '0'
        }, ` +
        `冻结${sellerBefore?.frozenBalance?.toNumber()?.toFixed(2) || '0'}, ` +
        `持仓${sellerPositionBefore?.quantity || 0}, 冻结持仓${
          sellerPositionBefore?.frozenQuantity || 0
        }`
    );

    // 买方：从冻结资金扣减，增加持仓
    console.log(
      `[余额更新] 买方${buyOrder.userId} 从冻结资金扣减 ${tradeAmount.toFixed(
        2
      )}`
    );

    // 🔧 修复市价买单撮合时的冻结资金扣减逻辑
    // 交易资金应该在订单创建时全部冻结，如果冻结余额不足说明系统存在数据一致性问题
    const currentFrozenBalance = buyerBefore?.frozenBalance?.toNumber() || 0;
    if (currentFrozenBalance < tradeAmount) {
      throw new Error(
        `买方${buyOrder.userId} 冻结余额不足，无法完成交易。` +
          `需要: ${tradeAmount.toFixed(
            2
          )}, 冻结余额: ${currentFrozenBalance.toFixed(2)}。` +
          `这表明系统存在数据一致性问题。`
      );
    }

    // 从冻结资金扣减交易金额
    console.log(
      `[余额更新] 买方${buyOrder.userId} 从冻结余额扣减 ${tradeAmount.toFixed(
        2
      )}`
    );
    // 从买家冻结金额中付款
    await this.userService.payBalance(buyOrder.userId, tradeAmount, db);

    // 🔧 优化买入订单的资金处理逻辑
    // 市价买单不在每轮撮合后立即解冻，而是在订单最终取消时统一解冻
    // 这样可以减少不必要的数据库操作，提高性能
    if (buyOrder.method === OrderMethod.LIMIT) {
      // 限价买单：检查是否需要解冻剩余资金
      // 注意：不能依赖buyOrderStatus，因为主动订单状态更新在所有撮合完成后才进行
      // 需要基于实际成交情况判断
      const currentOrder = await db.order.findUnique({
        where: { id: buyOrder.id },
        select: {
          quantity: true,
          filledQuantity: true,
          price: true,
          averagePrice: true,
        },
      });

      if (currentOrder) {
        const remainingQuantity =
          currentOrder.quantity - (currentOrder.filledQuantity || 0);

        // 如果订单已完全成交，解冻订单价格与实际成交价格的差额
        if (remainingQuantity <= 0) {
          // 计算应该解冻的金额：订单价格 * 订单数量 - 实际成交价格 * 成交数量
          const orderTotalAmount =
            currentOrder.price.toNumber() * currentOrder.quantity;
          const actualAveragePrice = currentOrder.averagePrice
            ? currentOrder.averagePrice.toNumber()
            : currentOrder.price.toNumber();
          const actualTotalAmount =
            actualAveragePrice * currentOrder.filledQuantity;
          const unfreezeAmount = orderTotalAmount - actualTotalAmount;

          if (unfreezeAmount > 0) {
            console.log(
              `[限价买单资金解冻-完全成交] 用户${
                buyOrder.userId
              } 解冻差额资金: ${unfreezeAmount.toFixed(
                2
              )} (订单总额: ${orderTotalAmount.toFixed(
                2
              )}, 实际成交总额: ${actualTotalAmount.toFixed(2)})`
            );
            await this.userService.unfreezeBalance(
              buyOrder.userId,
              unfreezeAmount,
              db
            );
          }
        }
      }
    }

    // 卖方：从冻结持仓转为实际扣减，增加资金
    console.log(
      `[余额更新] 卖方${sellOrder.userId} 从冻结持仓扣减 ${quantity} 股 ${symbol}`
    );
    await this.userService.deductFromFrozenPosition(
      sellOrder.userId,
      symbol,
      quantity,
      db
    );

    // 卖方：增加资金
    console.log(
      `[余额更新] 卖方${sellOrder.userId} 增加余额 ${tradeAmount.toFixed(2)}`
    );
    await db.user.update({
      where: { id: sellOrder.userId },
      data: {
        balance: {
          increment: tradeAmount,
        },
      },
    });

    // 买方：增加持仓
    console.log(
      `[余额更新] 买方${buyOrder.userId} 增加持仓 ${quantity} 股 ${symbol}`
    );
    // 更新持仓
    await this.updatePositionInTransaction(
      db,
      buyOrder.userId,
      symbol,
      OrderType.BUY,
      quantity,
      price
    );

    // 如果提供了持仓变化跟踪，更新它
    if (positionChanges) {
      const currentSellerChange = positionChanges.get(sellOrder.userId) || 0;
      const currentBuyerChange = positionChanges.get(buyOrder.userId) || 0;
      positionChanges.set(sellOrder.userId, currentSellerChange - quantity);
      positionChanges.set(buyOrder.userId, currentBuyerChange + quantity);

      console.log(
        `[余额更新] 持仓变化跟踪 - ` +
          `卖方${sellOrder.userId}: ${currentSellerChange} -> ${
            currentSellerChange - quantity
          }, ` +
          `买方${buyOrder.userId}: ${currentBuyerChange} -> ${
            currentBuyerChange + quantity
          }`
      );
    }

    // 获取更新后的用户状态
    const buyerAfter = await db.user.findUnique({
      where: { id: buyOrder.userId },
      select: { balance: true, frozenBalance: true },
    });

    const sellerAfter = await db.user.findUnique({
      where: { id: sellOrder.userId },
      select: { balance: true, frozenBalance: true },
    });

    const buyerPositionAfter = await db.position.findUnique({
      where: { userId_symbol: { userId: buyOrder.userId, symbol } },
      select: { quantity: true, frozenQuantity: true, avgPrice: true },
    });

    const sellerPositionAfter = await db.position.findUnique({
      where: { userId_symbol: { userId: sellOrder.userId, symbol } },
      select: { quantity: true, frozenQuantity: true, avgPrice: true },
    });

    console.log(
      `[余额更新] 更新后状态 - ` +
        `买方${buyOrder.userId}: 余额${
          buyerAfter?.balance?.toNumber()?.toFixed(2) || '0'
        }, ` +
        `冻结${buyerAfter?.frozenBalance?.toNumber()?.toFixed(2) || '0'}, ` +
        `持仓${buyerPositionAfter?.quantity || 0}, 冻结持仓${
          buyerPositionAfter?.frozenQuantity || 0
        }; ` +
        `卖方${sellOrder.userId}: 余额${
          sellerAfter?.balance?.toNumber()?.toFixed(2) || '0'
        }, ` +
        `冻结${sellerAfter?.frozenBalance?.toNumber()?.toFixed(2) || '0'}, ` +
        `持仓${sellerPositionAfter?.quantity || 0}, 冻结持仓${
          sellerPositionAfter?.frozenQuantity || 0
        }`
    );

    // 🚨 交易撮合完成后检查买卖双方是否出现负数
    const buyerBalanceOk = await this.negativeDetectionService.checkUserBalance(
      buyOrder.userId,
      `交易撮合完成-买方余额检查(用户${buyOrder.userId})`
    );
    const buyerPositionOk =
      await this.negativeDetectionService.checkUserPosition(
        buyOrder.userId,
        buyOrder.symbol, // 使用订单的股票代码
        `交易撮合完成-买方持仓检查(用户${buyOrder.userId})`
      );
    const sellerBalanceOk =
      await this.negativeDetectionService.checkUserBalance(
        sellOrder.userId,
        `交易撮合完成-卖方余额检查(用户${sellOrder.userId})`
      );
    const sellerPositionOk =
      await this.negativeDetectionService.checkUserPosition(
        sellOrder.userId,
        sellOrder.symbol, // 使用订单的股票代码
        `交易撮合完成-卖方持仓检查(用户${sellOrder.userId})`
      );

    if (
      !buyerBalanceOk ||
      !buyerPositionOk ||
      !sellerBalanceOk ||
      !sellerPositionOk
    ) {
      console.error(
        `🛑 交易撮合完成后检测到负数 - ` +
          `买方${buyOrder.userId}(余额:${buyerBalanceOk},持仓:${buyerPositionOk}), ` +
          `卖方${sellOrder.userId}(余额:${sellerBalanceOk},持仓:${sellerPositionOk})`
      );
      // 注意：这里在事务内，不能直接停止系统，但会记录错误
      throw new Error('交易撮合完成后检测到负数，事务将回滚');
    }

    console.log(
      `[余额更新] 交易处理完成 - 买方: ${buyOrder.userId}, 卖方: ${sellOrder.userId}`
    );
  }

  /** 广播市场数据更新 */
  async broadcastMarketDataUpdate(symbol: string) {
    // 获取最新成交价格（使用最后一次交易的价格）
    const latestTrade = await this.prisma.trade.findFirst({
      orderBy: { executedAt: 'desc' },
      select: { price: true },
    });

    const latestPrice = latestTrade ? latestTrade.price.toNumber() : 150.0;

    // 检查价格是否与上次相同，如果相同则跳过广播
    const lastPrice = this.lastMarketPrices.get(symbol);
    if (lastPrice !== undefined && lastPrice === latestPrice) {
      // 价格未变化，跳过广播
      return;
    }

    // 更新缓存的价格
    this.lastMarketPrices.set(symbol, latestPrice);

    // 计算今日开盘价（简化实现，使用当日第一笔交易价格）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const firstTradeToday = await this.prisma.trade.findFirst({
      where: {
        executedAt: { gte: todayStart },
      },
      orderBy: { executedAt: 'asc' },
      select: { price: true },
    });

    const openPrice = firstTradeToday
      ? firstTradeToday.price.toNumber()
      : latestPrice;
    const change = latestPrice - openPrice;
    const changePercent = openPrice > 0 ? change / openPrice : 0;

    // 获取今日最高最低价
    const todayPriceStats = await this.prisma.trade.aggregate({
      where: {
        executedAt: { gte: todayStart },
      },
      _max: { price: true },
      _min: { price: true },
      _sum: { quantity: true },
    });

    const marketData = {
      symbol,
      price: latestPrice,
      change: change,
      changePercent: changePercent,
      open: openPrice,
      high: todayPriceStats._max.price
        ? todayPriceStats._max.price.toNumber()
        : latestPrice,
      low: todayPriceStats._min.price
        ? todayPriceStats._min.price.toNumber()
        : latestPrice,
      volume: todayPriceStats._sum.quantity || 0,
      timestamp: new Date(),
    };
    this.marketGateway.broadcastMarketUpdate(marketData);
  }

  /** 事务重试机制 */
  private async executeWithRetry(
    operation: () => Promise<any>,
    maxRetries = 3
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries || !this.isRetryableError(error)) {
          throw error;
        }
        // 指数退避
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
  }

  private isRetryableError(error: any): boolean {
    return (
      error.code === 'P2034' || // Transaction conflict
      error.code === 'P2002' || // Unique constraint violation
      (error.message && error.message.includes('deadlock'))
    );
  }

  /** 在事务内更新持仓 */
  private async updatePositionInTransaction(
    db: any,
    userId: number,
    symbol: string,
    orderType: OrderType,
    quantity: number,
    price: number
  ) {
    console.log(
      `[持仓更新] 开始更新持仓 - 用户${userId}, 股票${symbol}, ` +
        `操作类型: ${orderType}, 数量: ${quantity}, 价格: ${price.toFixed(2)}`
    );

    const existingPosition = await db.position.findUnique({
      where: {
        userId_symbol: {
          userId,
          symbol,
        },
      },
    });

    console.log(
      `[持仓更新] 更新前持仓状态 - 用户${userId}, 股票${symbol}: ` +
        `${
          existingPosition
            ? `数量${
                existingPosition.quantity
              }, 平均价格${existingPosition.avgPrice
                .toNumber()
                .toFixed(2)}, 冻结${existingPosition.frozenQuantity || 0}`
            : '无持仓'
        }`
    );

    if (orderType === OrderType.BUY) {
      if (existingPosition) {
        // 计算新的平均成本价
        const totalCost =
          existingPosition.quantity *
            parseFloat(existingPosition.avgPrice.toString()) +
          quantity * price;
        const totalQuantity = existingPosition.quantity + quantity;
        const newAvgPrice = totalCost / totalQuantity;

        console.log(
          `[持仓更新] 买入操作 - 用户${userId}, 股票${symbol}: ` +
            `原持仓${existingPosition.quantity}@${existingPosition.avgPrice
              .toNumber()
              .toFixed(2)}, ` +
            `新增${quantity}@${price.toFixed(2)}, ` +
            `更新后${totalQuantity}@${newAvgPrice.toFixed(2)}`
        );

        const result = await db.position.update({
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

        console.log(
          `[持仓更新] 买入更新完成 - 用户${userId}, 股票${symbol}: ` +
            `最终持仓${result.quantity}@${result.avgPrice
              .toNumber()
              .toFixed(2)}`
        );

        // 🚨 持仓更新后检查是否出现负数
        const positionOk =
          await this.negativeDetectionService.checkUserPosition(
            userId,
            symbol, // 使用实际的股票代码
            `持仓更新-买入后检查(用户${userId})`
          );
        if (!positionOk) {
          console.error(`🛑 用户${userId}买入后持仓更新检测到负数`);
          throw new Error(`持仓更新后检测到负数 - 用户${userId}`);
        }

        return result;
      } else {
        console.log(
          `[持仓更新] 创建新持仓 - 用户${userId}, 股票${symbol}: ` +
            `数量${quantity}@${price.toFixed(2)}`
        );

        // 创建新持仓
        const result = await db.position.upsert({
          where: {
            userId_symbol: {
              userId,
              symbol,
            },
          },
          update: {
            quantity,
            avgPrice: price,
          },
          create: {
            userId,
            symbol,
            quantity,
            avgPrice: price,
          },
        });

        console.log(
          `[持仓更新] 新持仓创建完成 - 用户${userId}, 股票${symbol}: ` +
            `持仓${result.quantity}@${result.avgPrice.toNumber().toFixed(2)}`
        );

        // 🚨 新持仓创建后检查是否出现负数
        const positionOk =
          await this.negativeDetectionService.checkUserPosition(
            userId,
            symbol, // 使用实际的股票代码
            `持仓更新-新建后检查(用户${userId})`
          );
        if (!positionOk) {
          console.error(`🛑 用户${userId}新建持仓后检测到负数`);
          throw new Error(`新建持仓后检测到负数 - 用户${userId}`);
        }

        return result;
      }
    } else {
      // SELL 订单 - 从冻结持仓中扣减
      if (existingPosition) {
        const actualSellQuantity = Math.min(
          quantity,
          existingPosition.frozenQuantity // 应该从冻结持仓中扣减
        );

        console.log(
          `[持仓更新] 卖出操作 - 用户${userId}, 股票${symbol}: ` +
            `原持仓${existingPosition.quantity}, 冻结${existingPosition.frozenQuantity}, ` +
            `卖出${quantity}, 实际卖出${actualSellQuantity}`
        );

        if (actualSellQuantity > 0) {
          // 使用UserService的sellPosition方法处理卖出操作
          const result = await this.userService.sellPosition(
            userId,
            symbol,
            actualSellQuantity,
            db
          );

          // 🚨 持仓卖出更新后检查是否出现负数
          const positionOk =
            await this.negativeDetectionService.checkUserPosition(
              userId,
              symbol, // 使用实际的股票代码
              `持仓更新-卖出后检查(用户${userId})`
            );
          if (!positionOk) {
            console.error(`🛑 用户${userId}卖出后持仓更新检测到负数`);
            throw new Error(`持仓卖出更新后检测到负数 - 用户${userId}`);
          }

          return result;
        } else {
          console.warn(
            `[持仓更新] 警告：冻结持仓不足 - 用户${userId}, 股票${symbol}, ` +
              `尝试卖出${quantity}, 但冻结持仓只有${existingPosition.frozenQuantity}`
          );
        }
      } else {
        console.warn(
          `[持仓更新] 警告：尝试卖出不存在的持仓 - 用户${userId}, 股票${symbol}, 数量${quantity}`
        );
      }
    }
  }

  /** 获取用户的订单列表 */
  async getUserOrders(userId: number) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        symbol: true,
        type: true,
        method: true,
        price: true,
        quantity: true,
        filledQuantity: true,
        avgFilledPrice: true,
        status: true,
        createdAt: true,
      },
    });

    return orders.map((order) => ({
      ...order,
      price: order.price?.toNumber() || null,
      avgFilledPrice: order.avgFilledPrice?.toNumber() || null,
    }));
  }

  /** 私有方法：验证订单输入参数 */
  private validateOrderInput(
    method: OrderMethod,
    price: number | undefined,
    quantity: number
  ): void {
    if (method === OrderMethod.LIMIT && (!price || price <= 0)) {
      throw new BadRequestException('限价单价格必须大于0');
    }
    if (quantity <= 0) {
      throw new BadRequestException('数量必须大于0');
    }
  }

  /** 私有方法：计算所需资金 */
  private async calculateRequiredAmount(
    userId: number,
    type: OrderType,
    method: OrderMethod,
    price: number | undefined,
    quantity: number
  ): Promise<number> {
    if (type === OrderType.BUY) {
      if (method === OrderMethod.MARKET) {
        // 市价买单：冻结用户所有可用资金
        // 使用统一的可用余额计算方法
        const availableBalance = await this.userService.getAvailableBalance(
          userId
        );

        if (availableBalance <= 0) {
          const user = await this.userService.findById(userId);
          throw new BadRequestException(
            `可用余额不足，当前可用余额: ${availableBalance.toFixed(2)} ` +
              `(总余额: ${user.balance
                .toNumber()
                .toFixed(2)}, 已冻结: ${user.frozenBalance
                .toNumber()
                .toFixed(2)})`
          );
        }

        console.log(
          `[市价买单] 用户${userId} 冻结全部可用资金: ${availableBalance.toFixed(
            2
          )}`
        );

        return availableBalance;
      } else {
        // 限价买单：使用指定价格
        return price! * quantity;
      }
    }
    return 0; // 卖单不需要计算资金
  }

  /** 私有方法：验证用户资源（余额或持仓） */
  private async validateUserResources(
    userId: number,
    symbol: string,
    type: OrderType,
    method: OrderMethod,
    quantity: number,
    requiredAmount?: number
  ): Promise<void> {
    if (type === OrderType.BUY) {
      // 买单：验证余额
      console.log(
        `[订单创建] 用户${userId} 验证余额 - 需要金额: ${requiredAmount!.toFixed(
          2
        )} (${method === OrderMethod.MARKET ? '全部可用资金' : '实际'})`
      );

      // 使用统一的可用余额计算方法
      const availableBalance = await this.userService.getAvailableBalance(
        userId
      );

      if (availableBalance < requiredAmount!) {
        const currentUser = await this.userService.findById(userId);
        throw new BadRequestException(
          `可用余额不足，当前可用余额: ${availableBalance.toFixed(
            2
          )}，需要: ${requiredAmount!.toFixed(2)} ` +
            `(总余额: ${currentUser.balance
              .toNumber()
              .toFixed(2)}, 已冻结: ${currentUser.frozenBalance
              .toNumber()
              .toFixed(2)})`
        );
      }

      console.log(
        `[订单创建] 用户${userId} 余额验证通过 - 需要金额: ${requiredAmount!.toFixed(
          2
        )}`
      );
    } else {
      // 卖单：验证持仓
      console.log(
        `[订单创建] 用户${userId} 验证持仓 - 股票: ${symbol}, 数量: ${quantity}`
      );

      const hasEnoughPosition = await this.positionService.checkSellQuantity(
        userId,
        symbol,
        quantity
      );
      if (!hasEnoughPosition) {
        throw new BadRequestException('持仓不足');
      }

      console.log(
        `[订单创建] 用户${userId} 持仓验证通过 - 股票: ${symbol}, 数量: ${quantity}`
      );
    }
  }
}
