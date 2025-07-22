import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TradeService } from './trade.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('trades')
@UseGuards(JwtAuthGuard)
export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  @Get()
  findAll() {
    return this.tradeService.getAllTrades();
  }

  @Get('my')
  findMyTrades(@Request() req) {
    const userId = req.user.userId;
    return this.tradeService.getTradesByUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tradeService.getTradeById(+id);
  }

  @Get('market-data')
  async getMarketData() {
    console.log(
      '🔥 热更新成功！API被调用 - 修改时间:',
      new Date().toISOString()
    );
    console.log('🚀 nodemon热更新功能正常工作！');
    return this.tradeService.getMarketData();
  }
}
