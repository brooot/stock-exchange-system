import { tool } from '@langchain/core/tools';
import z from 'zod';
import { OrderService } from '../../order/order.service';
import { getCurrentTaskInput, interrupt } from '@langchain/langgraph';
import { OrderMethod, OrderStatus, OrderType } from '@prisma/client';
import { CustomGraphState } from '../consts';

export function createGetOrderInfo(orderService: OrderService) {
  return tool(
    async (_input) => {
      const response = interrupt({
        desc: `获取订单信息我需要访问数据库，您是否同意？`,
        interruptType: 'permission', // 注意，该 type 自定义为统一接受 {approved: boolean} 格式的 返回参数 方便前端统一处理。
      });
      if (!response.approved) {
        return '用户拒绝授权获取订单信息';
      }

      const state = getCurrentTaskInput() as typeof CustomGraphState.State;
      const orders = await orderService.getUserOrders(state.userId);
      return `当前用户${state.userId}的订单信息为：
      ${orders
        .map(
          (order) =>
            `订单号：${order.id} - ${
              order.method === OrderMethod.LIMIT ? '限价' : '市价'
            }${order.type === OrderType.BUY ? '买入' : '卖出'}${order.symbol}${
              order.quantity
            }股，定价：${order.price || '-'}元。当前状态：${
              order.status === OrderStatus.FILLED ? '已完全成交' : '撮合中'
            }`
        )
        .join('\n')}`;
    },
    {
      name: 'get_user_order_info',
      description:
        '调用此工具获取当前用户的订单信息。注意：市价单不需要指定价格，所以市价单的价格显示为-',
      schema: z.object({}),
    }
  );
}
