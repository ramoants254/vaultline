import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';

@Controller()
export class HealthController {
  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'payments-service', timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  async getReadiness(@Res() res: Response) {
    const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await redis.connect();
      await redis.ping();
      return res.status(HttpStatus.OK).json({ status: 'ready', checks: { redis: 'UP' } });
    } catch (error: any) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: 'DOWN', checks: { redis: 'DOWN' }, error: error.message });
    } finally {
      await redis.quit().catch(() => undefined);
    }
  }
}
