import { Module, DynamicModule, Global } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { KafkaService } from './kafka.service';

export interface KafkaModuleOptions {
  clientId: string;
  brokers: string[];
  groupId: string;
}

export interface KafkaModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<KafkaModuleOptions> | KafkaModuleOptions;
}

@Global()
@Module({})
export class KafkaModule {
  static forRoot(options: KafkaModuleOptions): DynamicModule {
    return {
      module: KafkaModule,
      imports: [
        ClientsModule.register([
          {
            name: 'KAFKA_SERVICE',
            transport: Transport.KAFKA,
            options: {
              client: {
                clientId: options.clientId,
                brokers: options.brokers,
              },
              consumer: {
                groupId: options.groupId,
              },
            },
          },
        ]),
      ],
      providers: [KafkaService],
      exports: [KafkaService, ClientsModule],
    };
  }

  static forRootAsync(options: KafkaModuleAsyncOptions): DynamicModule {
    return {
      module: KafkaModule,
      imports: [
        ...(options.imports || []),
        ClientsModule.registerAsync([
          {
            name: 'KAFKA_SERVICE',
            imports: options.imports || [],
            inject: options.inject || [],
            useFactory: async (...args: any[]) => {
              const kafkaOptions = await options.useFactory(...args);
              return {
                transport: Transport.KAFKA,
                options: {
                  client: {
                    clientId: kafkaOptions.clientId,
                    brokers: kafkaOptions.brokers,
                  },
                  consumer: {
                    groupId: kafkaOptions.groupId,
                  },
                },
              };
            },
          },
        ]),
      ],
      providers: [KafkaService],
      exports: [KafkaService, ClientsModule],
    };
  }
}
