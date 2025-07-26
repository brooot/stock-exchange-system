import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  namespace: '/market',
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('MarketGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // 广播市场数据更新
  broadcastMarketUpdate(marketData: any) {
    this.server.emit('marketUpdate', marketData);
    this.logger.log('Market data broadcasted to all clients');
  }

  // 广播交易完成事件
  broadcastTradeCompleted(tradeData: any) {
    this.server.emit('tradeCompleted', tradeData);
    this.logger.log('Trade completion broadcasted to all clients');
  }

  // 广播价格更新事件（用于K线实时更新）
  broadcastPriceUpdate(priceData: any) {
    this.server.emit('priceUpdate', priceData);
    this.logger.log('Price update broadcasted to all clients');
  }

  // 广播K线数据更新
  broadcastKlineUpdate(klineData: any) {
    this.server.emit('klineUpdate', klineData);
    this.logger.log('Kline update broadcasted to all clients');
  }
}