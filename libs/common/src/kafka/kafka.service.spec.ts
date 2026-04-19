import { Test, TestingModule } from '@nestjs/testing';
import { KafkaService } from './kafka.service';
import { of } from 'rxjs';

describe('KafkaService', () => {
  let service: KafkaService;
  let kafkaClient: {
    connect: jest.Mock;
    emit: jest.Mock;
    send: jest.Mock;
    subscribeToResponseOf: jest.Mock;
  };

  beforeEach(async () => {
    kafkaClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      send: jest.fn().mockReturnValue(of({ result: 'ok' })),
      subscribeToResponseOf: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaService,
        { provide: 'KAFKA_SERVICE', useValue: kafkaClient },
      ],
    }).compile();

    service = module.get<KafkaService>(KafkaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── onModuleInit ─────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('connects the Kafka client', async () => {
      await service.onModuleInit();
      expect(kafkaClient.connect).toHaveBeenCalledTimes(1);
    });
  });

  // ─── emit ─────────────────────────────────────────────────────────────────

  describe('emit()', () => {
    it('delegates to kafkaClient.emit with correct topic and data', () => {
      service.emit('user.created', { userId: '123' });
      expect(kafkaClient.emit).toHaveBeenCalledWith('user.created', {
        userId: '123',
      });
    });

    it('fire-and-forget — returns void', () => {
      const result = service.emit('topic', {});
      expect(result).toBeUndefined();
    });
  });

  // ─── send ─────────────────────────────────────────────────────────────────

  describe('send()', () => {
    it('sends message and returns resolved value via firstValueFrom', async () => {
      kafkaClient.send.mockReturnValue(of({ processed: true }));

      const result = await service.send('process.job', { id: 1 });

      expect(kafkaClient.send).toHaveBeenCalledWith('process.job', { id: 1 });
      expect(result).toEqual({ processed: true });
    });
  });

  // ─── subscribeToTopic ─────────────────────────────────────────────────────

  describe('subscribeToTopic()', () => {
    it('calls subscribeToResponseOf on the kafka client', () => {
      service.subscribeToTopic('booking.confirmed');
      expect(kafkaClient.subscribeToResponseOf).toHaveBeenCalledWith(
        'booking.confirmed',
      );
    });
  });

});
