import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueueService } from './queue.service';

@Controller('queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(private queueService: QueueService) {}

  @Get('stats')
  async getQueueStats() {
    return await this.queueService.getQueueStats();
  }

  @Post('clean')
  async cleanQueues() {
    await this.queueService.cleanQueues();
    return { message: '队列清理完成' };
  }

  @Post('pause')
  async pauseQueues() {
    await this.queueService.pauseQueues();
    return { message: '队列已暂停' };
  }

  @Post('resume')
  async resumeQueues() {
    await this.queueService.resumeQueues();
    return { message: '队列已恢复' };
  }
}