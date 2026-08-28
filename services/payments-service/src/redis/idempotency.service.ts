import { Injectable, OnModuleInit, ConflictException } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class IdempotencyService implements OnModuleInit {
  private client: Redis;

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : 'redis://localhost:6379');
    this.client = new Redis(redisUrl);
  }

  async verifyAndLockKey(idempotencyKey: string, ttlSeconds: number = 86400): Promise<any | null> {
    const key = `idempotency:${idempotencyKey}`;
    
    // Check if key exists
    const existing = await this.client.get(key);
    if (existing) {
      if (existing === 'LOCKED') {
        throw new ConflictException('Concurrent request with same idempotency key in progress');
      }
      // Return cached response
      return JSON.parse(existing);
    }

    // Set lock
    await this.client.set(key, 'LOCKED', 'EX', 60); // 60s lock
    return null; // Key is free to process
  }

  async saveKeyResponse(idempotencyKey: string, responseData: any, ttlSeconds: number = 86400) {
    const key = `idempotency:${idempotencyKey}`;
    await this.client.set(key, JSON.stringify(responseData), 'EX', ttlSeconds);
  }
}