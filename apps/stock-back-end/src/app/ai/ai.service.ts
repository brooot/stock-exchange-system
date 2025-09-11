import { Injectable, OnModuleInit } from '@nestjs/common';
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
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
// import { ChatAlibabaTongyi } from '@langchain/community/chat_models/alibaba_tongyi';
import { AlibabaTongyiEmbeddings } from '@langchain/community/embeddings/alibaba_tongyi';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import path from 'path';
import { existsSync } from 'fs';
import { createRetrieverTool } from 'langchain/tools/retriever';

export interface ChatRequest {
  userId: number;
  message?: string;
  sessionId?: string;
  resume?: any;
}

@Injectable()
export class AiService implements OnModuleInit {
  private llm: ChatOpenAI;
  private agent: ReturnType<typeof createReactAgent>;
  private tools: ReturnType<typeof tool>[];

  async onModuleInit() {
    const pdfPath = path.resolve(
      process.cwd(),
      'apps/stock-back-end/src/app/ai/assets/brooot_profile.pdf'
    );
    const loader = new PDFLoader(pdfPath);
    const docs = await loader.load();
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
    const docSplits = await textSplitter.splitDocuments(docs);

    const cleanedDocSplits = docSplits.map((doc) => ({
      ...doc,
      metadata: {
        source:
          typeof doc.metadata.source === 'string'
            ? doc.metadata.source
            : 'brooot_profile.pdf',
        page:
          typeof doc.metadata.loc?.pageNumber === 'number'
            ? doc.metadata.loc.pageNumber
            : 1,
        chunk_size: doc.pageContent.length,
      },
    }));

    const embeddings = new AlibabaTongyiEmbeddings({
      modelName: 'text-embedding-v4',
    });
    const collectionName = process.env.CHROMA_COLLECTION || 'resume_brooot';
    let vectorStore: any;
    if (process.env.CHROMA_URL) {
      try {
        vectorStore = await Chroma.fromExistingCollection(embeddings, {
          collectionName,
          url: process.env.CHROMA_URL,
        });
        const count = await vectorStore.collection?.count();
        if (!count || count === 0) {
          await vectorStore.addDocuments(cleanedDocSplits);
        } else {
          console.log('===> 向量数据库已存在，无需初始化');
        }
      } catch (err) {
        vectorStore = await Chroma.fromDocuments(cleanedDocSplits, embeddings, {
          collectionName,
          url: process.env.CHROMA_URL,
        });
      }
    } else {
      vectorStore = await MemoryVectorStore.fromDocuments(
        cleanedDocSplits,
        embeddings
      );
    }

    const retriever = vectorStore.asRetriever();
    const retrievalTool = createRetrieverTool(retriever, {
      name: 'retrieve_resume_info',
      description: '用于检索并返回当前交易系统的开发者的简历信息',
    });

    this.tools.push(retrievalTool);

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

  constructor(
    private readonly orderService: OrderService,
    private readonly tradeService: TradeService,
    private readonly userService: UserService
  ) {
    this.llm = new ChatOpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
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
  }

  // private getApiKey(): string {
  //   const key = process.env.DEEPSEEK_API_KEY;
  //   // const key = process.env.ALIBABA_API_KEY;
  //   if (!key) throw new Error('Missing _API_KEY');
  //   return key;
  // }

  async handleStreamOutput(stream: any, emitter: EventEmitter) {
    let hasContent = false;
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
        if (chunk?.__interrupt__?.length) {
          hasContent = true;
          emitter.emit(
            'message',
            JSON.stringify({
              type: 'interrupt',
              data: chunk?.__interrupt__,
            })
          );
        }
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
            // messages: [new HumanMessage(req.message)],
            messages: [{ role: 'user', content: req.message }],
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
