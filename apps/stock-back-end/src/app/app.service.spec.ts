import { Test } from '@nestjs/testing';
import { AppService, messageForTest } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = app.get<AppService>(AppService);
  });

  describe('getData', () => {
    it('should return "Hello API Test"', () => {
      expect(service.getData()).toEqual({ message: messageForTest });
    });
  });
});
