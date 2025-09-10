import {
  Controller,
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

  @Sse('chat/stream')
  stream(
    @Query('payload') payload: string | undefined,
    @Request() req
  ): Observable<MessageEvent> {
    const userId = req.user.userId as number;

    let parsedPayload = {};
    if (payload) {
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        // ignore invalid JSON and fall back to query params
      }
    }

    const emitter = this.aiService.chatStream({
      userId,
      ...parsedPayload,
    });

    return fromEventPattern<MessageEvent>(
      (handler) => emitter.on('message', handler),
      (handler) => emitter.off('message', handler)
    ).pipe(map((data) => ({ data })));
  }
}
