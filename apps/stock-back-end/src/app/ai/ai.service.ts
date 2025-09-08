/* eslint-disable @typescript-eslint/no-unused-expressions */
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { OrderService } from '../order/order.service';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { isAIMessageChunk } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph-checkpoint';

import {
  HumanMessage,
  SystemMessage,
  AIMessageChunk,
} from '@langchain/core/messages';
import { Annotation, Messages } from '@langchain/langgraph';
import { traceable } from 'langsmith/traceable';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { Intent, IntentType } from './nodes/intent';
import { MAX_TOKENS, SYSTEM_PROMPT } from './consts';
import { createGetStockPrice } from './tools/price-check';
import { TradeService } from '../trade/trade.service';

export interface ChatRequest {
  userId: number;
  message: string;
  sessionId?: string;
}

// LangGraph 状态定义
const ConversationState = Annotation.Root({
  userId: Annotation<number>,
  sessionId: Annotation<string>,
  userMessage: Annotation<string>,
  intent: Annotation<{
    type: IntentType;
    confidence: number;
    entities?: Record<string, any>;
  } | null>,
  orders: Annotation<any[] | null>,
  llmResponse: Annotation<string | null>,
  finalResponse: Annotation<string | null>,
  isStreaming: Annotation<boolean>,
  streamChunks: Annotation<string[]>,
});

@Injectable()
export class AiService {
  private llm: ChatOpenAI;
  private agent: ReturnType<typeof createReactAgent>;
  private tools: ReturnType<typeof tool>[];

  constructor(
    private readonly orderService: OrderService,
    private readonly tradeService: TradeService
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

    this.tools = [createGetStockPrice(this.tradeService)];
    // 自定义LLM调用逻辑：确保系统提示只出现一次
    // const customModel = {
    //   ...this.llm,
    //   async invoke(inputMessages, options) {
    //     // 过滤掉输入中可能存在的重复系统提示
    //     const userMessages = inputMessages.filter(
    //       (msg) => msg.role !== 'system' // 保留非系统提示的消息（用户/助手/工具消息）
    //     );

    //     // 构建最终输入：[唯一系统提示] + [用户/助手/工具消息]
    //     const finalMessages = [systemPrompt, ...userMessages];

    //     // 调用原始模型
    //     return await model.invoke(finalMessages, options);
    //   },
    // };
    // 构建 Agent with tools
    this.agent = createReactAgent({
      llm: this.llm, // 大模型实例
      tools: this.tools, // 提供工具调用能力
      checkpointer: new MemorySaver(), // 提供短期会话持久化能力
      prompt: new SystemMessage(SYSTEM_PROMPT), // ! TODO 在这里添加，避免重复添加系统提示词
    });
  }

  private getApiKey(): string {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('Missing DEEPSEEK_API_KEY');
    return key;
  }

  async chat(req: ChatRequest) {
    const traceableChat = traceable(
      async (request: ChatRequest) => {
        const result = await this.agent.invoke({
          userId: request.userId,
          sessionId: request.sessionId,
          userMessage: request.message,
          isStreaming: false,
          streamChunks: [],
        });

        return result.finalResponse;
      },
      { name: 'ai_chat', run_type: 'llm' }
    );

    return await traceableChat(req);
  }

  chatStream(req: ChatRequest): EventEmitter {
    const emitter = new EventEmitter();

    // 异步执行以避免阻塞
    (async () => {
      try {
        const inputs = {
          messages: [
            // new SystemMessage(SYSTEM_PROMPT),
            new HumanMessage(req.message),
          ],
        };
        const stream = await this.agent.stream(inputs, {
          streamMode: 'messages',
          configurable: {
            userId: req.userId,
            thread_id: req.sessionId,
          },
        });
        // eslint-disable-next-line
        // @ts-ignore
        for await (const [message, _metadata] of stream) {
          if (isAIMessageChunk(message) && message.tool_call_chunks?.length) {
            console.log(
              `${message.getType()} MESSAGE TOOL CALL CHUNK: ${
                message.tool_call_chunks[0].args
              }`
            );
          } else {
            message.content &&
              console.log(
                `${message.getType()} MESSAGE CONTENT: ${message.content}`
              );
          }
          if (
            isAIMessageChunk(message) &&
            !message.tool_call_chunks?.length &&
            message.content
          )
            emitter.emit(
              'message',
              JSON.stringify({
                type: 'text_chunk',
                data: message.content,
              })
            );
        }
        emitter.emit('message', '[DONE]');
        return;
      } catch (e: any) {
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
