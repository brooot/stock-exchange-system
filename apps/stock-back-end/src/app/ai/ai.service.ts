import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { OrderService } from '../order/order.service';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { BaseMessageLike, isAIMessageChunk } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph-checkpoint';

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Command } from '@langchain/langgraph';
import { CustomGraphState, MAX_TOKENS, SYSTEM_PROMPT } from './consts';
import { createGetStockPrice } from './tools/price-check';
import { TradeService } from '../trade/trade.service';
import { UserService } from '../user/user.service';
import { createGetOrderInfo } from './tools/order-tools';

export interface ChatRequest {
  userId: number;
  message?: string;
  sessionId?: string;
  resume?: any;
}

@Injectable()
export class AiService {
  private llm: ChatOpenAI;
  private agent: ReturnType<typeof createReactAgent>;
  private tools: ReturnType<typeof tool>[];

  constructor(
    private readonly orderService: OrderService,
    private readonly tradeService: TradeService,
    private readonly userService: UserService
  ) {
    this.llm = new ChatOpenAI({
      apiKey: this.getApiKey(),
      configuration: {
        baseURL: process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1',
      },
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      streaming: true,
      maxTokens: MAX_TOKENS,
    });

    this.tools = [
      createGetStockPrice(this.tradeService),
      createGetOrderInfo(this.orderService),
    ];

    const prompt = (
      state: typeof CustomGraphState.State
    ): BaseMessageLike[] => {
      const userName = state.userName;
      return [
        new SystemMessage(
          `用户名称是${userName}；用户ID是${state.userId}。${SYSTEM_PROMPT}`
        ),
        ...state.messages,
      ];
    };

    // 构建 Agent with tools
    this.agent = createReactAgent({
      llm: this.llm, // 大模型实例
      tools: this.tools, // 提供工具调用能力
      checkpointer: new MemorySaver(), // 提供短期会话持久化能力
      prompt, // ! TODO 在这里添加，避免重复添加系统提示词
      stateSchema: CustomGraphState,
    });
  }

  private getApiKey(): string {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('Missing DEEPSEEK_API_KEY');
    return key;
  }

  async handleStreamOutput(stream: any, emitter: EventEmitter) {
    let hasContent = false;
    // eslint-disable-next-line
    // @ts-ignore
    for await (const [streamMode, chunk] of stream) {
      if (streamMode === 'messages') {
        const [message, _metadata] = chunk;
        if (
          isAIMessageChunk(message) &&
          !message.tool_call_chunks?.length &&
          message.content
        ) {
          hasContent = true;
          emitter.emit(
            'message',
            JSON.stringify({
              type: 'text_chunk',
              data: message.content,
            })
          );
        }
      } else if (streamMode === 'updates') {
        console.log('===> current values: ', chunk);
        if (chunk?.__interrupt__?.length) {
          console.log('===> values interrupt: ', chunk?.__interrupt__);
          // hasContent = true;
          emitter.emit(
            'message',
            JSON.stringify({
              type: 'interrupt',
              data: chunk?.__interrupt__,
            })
          );
        }
      }
      if (!hasContent) {
        // emitter.emit(
        //   'message',
        //   JSON.stringify({
        //     type: 'error',
        //     error: '系统繁忙，请稍后再试。',
        //   })
        // );
      }
    }
    if (hasContent) {
      emitter.emit('message', '[DONE]');
    }
  }

  chatStream(req: ChatRequest): EventEmitter {
    const emitter = new EventEmitter();

    // 异步执行以避免阻塞
    (async () => {
      try {
        let inputs;
        if (req.resume !== undefined) {
          inputs = new Command({ resume: req.resume });
        } else {
          const userName = await this.userService.getUserName(req.userId);
          inputs = {
            messages: [new HumanMessage(req.message)],
            // 提供信息给系统提示词消费
            userName,
            userId: req.userId,
            sessionId: req.sessionId,
          };
        }
        const stream = await this.agent.stream(inputs, {
          streamMode: ['messages', 'updates'],
          configurable: {
            thread_id: req.sessionId,
          },
        });

        await this.handleStreamOutput(stream, emitter);

        // const secondStream = await this.agent.stream(
        //   new Command({ resume: { approved: true } }),
        //   {
        //     streamMode: ['messages', 'values'],
        //     configurable: {
        //       userId: req.userId,
        //       thread_id: req.sessionId,
        //     },
        //   }
        // );
        // await this.handleStreamOutput(secondStream, emitter);
      } catch (e: any) {
        console.log('===> 出错: ', e);
        emitter.emit(
          'message',
          JSON.stringify({
            type: 'error',
            error: e?.message || '网络错误，请稍后再试。',
          })
        );
        emitter.emit('message', '[DONE]');
      }
    })();

    return emitter;
  }
}
