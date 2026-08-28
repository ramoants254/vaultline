import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : 'redis://localhost:6379');

export const redis = new Redis(redisUrl);

// Helper key generators for auth blacklisting
export const getBlacklistKey = (token: string) => `auth:blacklist:${token}`;