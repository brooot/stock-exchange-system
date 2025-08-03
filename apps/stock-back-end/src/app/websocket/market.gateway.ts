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
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://121.199.170.204:3000', // 添加生产环境前端地址
      'http://121.199.170.204:3001', // 添加生产环境后端地址
    ],
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
    this.logger.log(
      `市场数据更新：symbol: ${marketData.symbol}, price: ${marketData.price}`
    );
  }

  // 广播交易完成事件
  broadcastTradeCompleted(tradeData: any) {
    this.server.emit('tradeCompleted', tradeData);
    // this.logger.log('Trade completion broadcasted to all clients');
  }

  // 广播价格更新事件（用于K线实时更新）
  broadcastPriceUpdate(priceData: any) {
    this.server.emit('priceUpdate', priceData);
    // this.logger.log(
    //   `Price updated, symbol: ${priceData.symbol}, price: ${priceData.price}`
    // );
  }

  // 广播K线数据更新
  broadcastKlineUpdate(klineData: any) {
    this.server.emit('klineUpdate', klineData);
    // this.logger.log('Kline update broadcasted to all clients');
  }
}
