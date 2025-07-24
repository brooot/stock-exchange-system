import { Controller, Post, Delete, Get, Body, Param, UseGuards, Request, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrderService } from './order.service';
import { OrderType, OrderMethod } from '@prisma/client';
import { IsEnum, IsNumber, IsPositive, IsOptional } from 'class-validator';

class CreateOrderDto {
  @IsEnum(OrderType, { message: '订单类型必须是BUY或SELL' })
  type: OrderType;

  @IsOptional()
  @IsEnum(OrderMethod, { message: '订单方式必须是MARKET或LIMIT' })
  method?: OrderMethod;

  @IsNumber({}, { message: '价格必须是数字' })
  @IsPositive({ message: '价格必须大于0' })
  price: number;

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
    return this.orderService.createOrder(
      userId,
      createOrderDto.type,
      createOrderDto.method || OrderMethod.LIMIT,
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
    return this.orderService.cancelOrder(orderId, userId);
  }
}
