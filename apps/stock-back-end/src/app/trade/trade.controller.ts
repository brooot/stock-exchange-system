import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { TradeService } from './trade.service';
import { OrderType, OrderMethod, TradeStatus } from '@prisma/client';

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
    }
  ) {
    const { userId, symbol, price, quantity, type, method } = tradeData;
    return this.tradeService.createTrade(
      userId,
      symbol,
      price,
      quantity,
      type,
      method
    );
  }

  @Get('user/:userId')
  async getTradesByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.tradeService.getTradesByUser(userId);
  }

  @Get()
  async getAllTrades() {
    return this.tradeService.getAllTrades();
  }

  @Get('status/:status')
  async getTradesByStatus(@Param('status') status: TradeStatus) {
    return this.tradeService.getTradesByStatus(status);
  }

  @Get('order/:orderId')
  async getTradeByOrderId(@Param('orderId') orderId: string) {
    return this.tradeService.getTradeByOrderId(orderId);
  }

  @Get(':id')
  async getTradeById(@Param('id', ParseIntPipe) id: number) {
    return this.tradeService.getTradeById(id);
  }

  @Patch(':id/status')
  async updateTradeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() statusData: { status: TradeStatus }
  ) {
    return this.tradeService.updateTradeStatus(id, statusData.status);
  }
}
