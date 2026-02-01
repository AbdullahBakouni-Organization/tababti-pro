import { Test, TestingModule } from '@nestjs/testing';
import { SocketServerController } from './socket-server.controller';
import { SocketServerService } from './socket-server.service';

describe('SocketServerController', () => {
  let socketServerController: SocketServerController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SocketServerController],
      providers: [SocketServerService],
    }).compile();

    socketServerController = app.get<SocketServerController>(SocketServerController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(socketServerController.getHello()).toBe('Hello World!');
    });
  });
});
