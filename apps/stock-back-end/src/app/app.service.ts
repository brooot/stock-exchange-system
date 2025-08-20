import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getData(): { message: string } {
    return { message: messageForTest };
  }
}
// 热更新
export const messageForTest = 'Hello API';
