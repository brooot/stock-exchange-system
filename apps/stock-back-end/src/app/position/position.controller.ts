import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { PositionService } from './position.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('positions')
@UseGuards(JwtAuthGuard)
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Get()
  async getUserPositions(@Request() req) {
    const userId = req.user.userId;
    return this.positionService.getUserPositions(userId);
  }

  @Get('portfolio/value')
  async getPortfolioValue(@Request() req) {
    const userId = req.user.userId;
    // 这里可以从市场数据服务获取当前价格
    // 暂时使用固定价格作为示例
    const currentPrices = {
      AAPL: 150.0,
    };
    return this.positionService.getUserPortfolioValue(userId, currentPrices);
  }

  @Get(':symbol')
  async getUserPosition(@Request() req, @Param('symbol') symbol: string) {
    const userId = req.user.userId;
    return this.positionService.getUserPosition(userId, symbol);
  }
}
