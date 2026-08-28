import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : 'redis://localhost:6379');
const redis = new Redis(redisUrl);

export class VelocityTracker {
  /**
   * Tracks and returns transaction count for an entity over a rolling window (60s)
   */
  static async recordAndGetVelocity(entityKey: string, windowSeconds: number = 60): Promise<number> {
    const key = `velocity:${entityKey}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    return count;
  }
}