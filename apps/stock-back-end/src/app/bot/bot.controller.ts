import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { BotService } from './bot.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('/bot')
@UseGuards(JwtAuthGuard)
export class BotController {
  constructor(private readonly botService: BotService) {}

  /** 启动机器人交易 */
  @Post('start')
  async startBotTrading() {
    return this.botService.startBotTrading();
  }

  /** 停止机器人交易 */
  @Post('stop')
  async stopBotTrading() {
    return this.botService.stopBotTrading();
  }

  /** 获取机器人状态 */
  @Get('status')
  async getBotStatus() {
    return this.botService.getBotStatus();
  }
}
