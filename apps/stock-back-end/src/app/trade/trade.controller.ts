import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { TradeService } from './trade.service';
import { OrderType, OrderMethod } from '@prisma/client';

@Controller('trades')
export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  @Post()
  async createTrade(
    @Body()
    tradeData: {
      userId: number;
      symbol: string;
      price: number;
      quantity: number;
      type: OrderType;
      method: OrderMethod;
    },
  ) {
    return this.tradeService.createTrade(
      tradeData.userId,
      tradeData.symbol,
      tradeData.price,
      tradeData.quantity,
      tradeData.type,
      tradeData.method,
    );
  }

  @Get('user/:userId')
  async getTradesByUser(@Param('userId') userId: string) {
    return this.tradeService.getTradesByUser(parseInt(userId));
  }

  @Get()
  async getAllTrades() {
    return this.tradeService.getAllTrades();
  }
}