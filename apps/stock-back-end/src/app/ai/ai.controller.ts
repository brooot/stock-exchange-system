import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Sse,
  MessageEvent,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { Observable, fromEventPattern, map } from 'rxjs';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(
    @Body() body: { message: string; sessionId?: string },
    @Request() req
  ) {
    const userId = req.user.userId as number;
    const { message, sessionId } = body;
    return this.aiService.chat({ userId, message, sessionId });
  }

  @Sse('chat/stream')
  stream(
    @Query('message') message: string,
    @Query('sessionId') sessionId: string,
    @Request() req
  ): Observable<MessageEvent> {
    const userId = req.user.userId as number;

    const emitter = this.aiService.chatStream({ userId, message, sessionId });

    return fromEventPattern<MessageEvent>(
      (handler) => emitter.on('message', handler),
      (handler) => emitter.off('message', handler)
    ).pipe(map((data) => ({ data })));
  }
}
