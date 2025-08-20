import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrderService } from './order.service';
import { OrderType, OrderMethod } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsNotEmpty,
} from 'class-validator';

class CreateOrderDto {
  @IsString({ message: '股票代码必须是字符串' })
  @IsNotEmpty({ message: '股票代码不能为空' })
  symbol: string;

  @IsEnum(OrderType, { message: '订单类型必须是BUY或SELL' })
  type: OrderType;

  @IsEnum(OrderMethod, { message: '订单方式必须是MARKET或LIMIT' })
  method: OrderMethod;

  @IsOptional()
  @IsNumber({}, { message: '价格必须是数字' })
  @IsPositive({ message: '价格必须大于0' })
  price?: number;

  @IsNumber({}, { message: '数量必须是数字' })
  @IsPositive({ message: '数量必须大于0' })
  quantity: number;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('create-order')
  async createOrder(
    @Body(ValidationPipe) createOrderDto: CreateOrderDto,
    @Request() req
  ) {
    const userId = req.user.userId;
    const method = createOrderDto.method || OrderMethod.LIMIT;

    // 验证市价单和限价单的价格要求
    if (method === OrderMethod.LIMIT && !createOrderDto.price) {
      throw new Error('限价单必须提供价格');
    }
    if (method === OrderMethod.MARKET && createOrderDto.price) {
      throw new Error('市价单不应该提供价格');
    }

    return this.orderService.pushIntoOrderQueue(
      userId,
      createOrderDto.symbol,
      createOrderDto.type,
      method,
      createOrderDto.price,
      createOrderDto.quantity
    );
  }

  @Get('my')
  async getMyOrders(@Request() req) {
    const userId = req.user.userId;
    return this.orderService.getUserOrders(userId);
  }

  @Delete(':id')
  async cancelOrder(@Param('id') orderId: string, @Request() req) {
    const userId = req.user.userId;
    return this.orderService.cancelOrder(parseInt(orderId), userId);
  }
}
