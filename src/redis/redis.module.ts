import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

console.log('REDIS_HOST:', process.env.REDIS_HOST);

const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || '',
  enableReadyCheck: true,
});

const redisPubSubClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || '',
  enableReadyCheck: true,
});

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useValue: redisClient,
    },
    {
      provide: 'REDIS_PUBSUB_CLIENT',
      useValue: redisPubSubClient,
    },
  ],
  exports: ['REDIS_CLIENT', 'REDIS_PUBSUB_CLIENT'],
})
export class RedisModule {}