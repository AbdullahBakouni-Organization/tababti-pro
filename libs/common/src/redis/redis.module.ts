import { Module, DynamicModule } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface RedisModuleOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  keyPrefix?: string;
}

export interface RedisModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<RedisModuleOptions> | RedisModuleOptions;
}

@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: 'REDIS_OPTIONS',
          useValue: options,
        },
        RedisService,
      ],
      exports: [RedisService],
    };
  }

  static forRootAsync(options: RedisModuleAsyncOptions): DynamicModule {
    return {
      module: RedisModule,
      imports: options.imports || [],
      providers: [
        {
          provide: 'REDIS_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        RedisService,
      ],
      exports: [RedisService],
    };
  }
}
