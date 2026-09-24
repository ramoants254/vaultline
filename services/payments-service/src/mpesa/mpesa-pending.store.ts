import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Stores the pending context for an in-flight M-Pesa STK Push or B2C payout.
 * When Safaricom's async callback arrives, this store is queried by
 * CheckoutRequestID (STK) or ConversationID (B2C) to retrieve the user/account
 * context needed to emit the correct RabbitMQ payment event.
 */
export interface StkPendingContext {
  idempotencyKey: string;
  userId: string;
  clearingAccountId: string;
  userWalletAccountId: string;
  amount: number;
  phoneNumber: string;
  initiatedAt: string;
}

export interface B2CPendingContext {
  idempotencyKey: string;
  userId: string;
  userWalletAccountId: string;
  amount: number;
  phoneNumber: string;
  initiatedAt: string;
}

@Injectable()
export class MpesaPendingStore implements OnModuleInit {
  private readonly logger = new Logger(MpesaPendingStore.name);
  private redis: Redis;

  // Pending entries are kept for 10 minutes — M-Pesa callbacks arrive within seconds
  // to a few minutes; if no callback arrives in 10 min the transaction timed out.
  private readonly TTL_SECONDS = 600;

  onModuleInit() {
    const redisUrl =
      process.env.REDIS_URL ||
      (process.env.REDIS_HOST
        ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
        : 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
  }

  // ─── STK Push ────────────────────────────────────────────────────────────────

  async saveStkPending(checkoutRequestId: string, ctx: StkPendingContext): Promise<void> {
    const key = `mpesa:stk:pending:${checkoutRequestId}`;
    await this.redis.set(key, JSON.stringify(ctx), 'EX', this.TTL_SECONDS);
    this.logger.log(`[MpesaPendingStore] STK context saved → ${checkoutRequestId}`);
  }

  async getStkPending(checkoutRequestId: string): Promise<StkPendingContext | null> {
    const key = `mpesa:stk:pending:${checkoutRequestId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as StkPendingContext;
  }

  async deleteStkPending(checkoutRequestId: string): Promise<void> {
    await this.redis.del(`mpesa:stk:pending:${checkoutRequestId}`);
  }

  // ─── B2C Payout ──────────────────────────────────────────────────────────────

  async saveB2CPending(conversationId: string, ctx: B2CPendingContext): Promise<void> {
    const key = `mpesa:b2c:pending:${conversationId}`;
    await this.redis.set(key, JSON.stringify(ctx), 'EX', this.TTL_SECONDS);
    this.logger.log(`[MpesaPendingStore] B2C context saved → ${conversationId}`);
  }

  async getB2CPending(conversationId: string): Promise<B2CPendingContext | null> {
    const key = `mpesa:b2c:pending:${conversationId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as B2CPendingContext;
  }

  async deleteB2CPending(conversationId: string): Promise<void> {
    await this.redis.del(`mpesa:b2c:pending:${conversationId}`);
  }
}
