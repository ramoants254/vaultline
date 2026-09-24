import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { RabbitMQService } from '../messaging/rabbitmq.service';
import { MpesaPendingStore } from './mpesa-pending.store';
import { IdempotencyService } from '../redis/idempotency.service';
import { paymentsTotal } from '../metrics';

/**
 * Receives asynchronous callbacks from Safaricom's M-Pesa servers.
 *
 * IMPORTANT: These endpoints are intentionally PUBLIC — Safaricom servers
 * POST to these URLs directly and cannot include a JWT. They are whitelisted
 * in the API Gateway before the JWT middleware runs.
 *
 * The controller resolves pending payment context from Redis and emits the
 * appropriate payment.completed / payment.failed event to RabbitMQ so the
 * rest of the Vaultline pipeline (Ledger, Fraud, Notifications) can react.
 */
@Controller('payments/mpesa')
export class MpesaCallbackController {
  private readonly logger = new Logger(MpesaCallbackController.name);

  constructor(
    private readonly pendingStore: MpesaPendingStore,
    private readonly rabbitService: RabbitMQService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  // ─── STK Push Callback ───────────────────────────────────────────────────────

  /**
   * Safaricom POSTs here after the customer completes (or fails) an STK prompt.
   *
   * Sample success payload shape:
   * {
   *   Body: {
   *     stkCallback: {
   *       MerchantRequestID, CheckoutRequestID,
   *       ResultCode,     // 0 = success
   *       ResultDesc,
   *       CallbackMetadata: { Item: [ { Name, Value }, ... ] }
   *     }
   *   }
   * }
   */
  @Post('stk-callback')
  @HttpCode(HttpStatus.OK)
  async handleStkCallback(@Body() payload: any): Promise<{ ResultCode: number; ResultDesc: string }> {
    const callback = payload?.Body?.stkCallback;
    if (!callback) {
      this.logger.warn('[STK Callback] Received malformed payload — missing stkCallback body');
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;
    this.logger.log(
      `[STK Callback] CheckoutRequestID=${CheckoutRequestID} ResultCode=${ResultCode}`,
    );

    const ctx = await this.pendingStore.getStkPending(CheckoutRequestID);
    if (!ctx) {
      this.logger.warn(
        `[STK Callback] No pending context found for CheckoutRequestID=${CheckoutRequestID} (possibly expired or already processed)`,
      );
      // Return 200 so Safaricom doesn't retry
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    const success = ResultCode === 0;

    if (success) {
      // Extract confirmed transaction details from callback metadata
      const items: Array<{ Name: string; Value: any }> =
        CallbackMetadata?.Item ?? [];
      const meta = Object.fromEntries(items.map((i) => [i.Name, i.Value]));

      const mpesaReceiptNumber = meta['MpesaReceiptNumber'] ?? `mpesa_${Date.now()}`;
      const confirmedAmount = meta['Amount'] ?? ctx.amount;
      const transactionDate = meta['TransactionDate'] ?? new Date().toISOString();

      paymentsTotal.inc({ operation: 'mpesa_deposit', status: 'COMPLETED' });

      await this.rabbitService.publish('payment.completed', {
        paymentId: mpesaReceiptNumber,
        type: 'DEPOSIT',
        provider: 'mpesa',
        userId: ctx.userId,
        clearingAccountId: ctx.clearingAccountId,
        userWalletAccountId: ctx.userWalletAccountId,
        amount: confirmedAmount,
        currency: 'KES',
        phoneNumber: ctx.phoneNumber,
        mpesaReceiptNumber,
        transactionDate,
        referenceId: ctx.idempotencyKey,
      });

      const result = {
        status: 'COMPLETED',
        paymentId: mpesaReceiptNumber,
        referenceId: ctx.idempotencyKey,
        amount: confirmedAmount,
        currency: 'KES',
        provider: 'mpesa',
      };

      await this.idempotencyService.saveKeyResponse(ctx.idempotencyKey, result);
      this.logger.log(
        `[STK Callback] ✅ Deposit COMPLETED — Receipt=${mpesaReceiptNumber} Amount=${confirmedAmount} KES`,
      );
    } else {
      paymentsTotal.inc({ operation: 'mpesa_deposit', status: 'FAILED' });

      await this.rabbitService.publish('payment.failed', {
        type: 'DEPOSIT',
        provider: 'mpesa',
        userId: ctx.userId,
        amount: ctx.amount,
        currency: 'KES',
        phoneNumber: ctx.phoneNumber,
        referenceId: ctx.idempotencyKey,
        reason: ResultDesc || 'M-Pesa STK Push failed',
        resultCode: ResultCode,
      });

      const failResult = {
        status: 'FAILED',
        referenceId: ctx.idempotencyKey,
        error: ResultDesc,
        provider: 'mpesa',
      };

      await this.idempotencyService.saveKeyResponse(ctx.idempotencyKey, failResult);
      this.logger.warn(
        `[STK Callback] ❌ Deposit FAILED — Code=${ResultCode} Desc="${ResultDesc}"`,
      );
    }

    // Cleanup pending entry regardless of outcome
    await this.pendingStore.deleteStkPending(CheckoutRequestID);

    // Safaricom expects a 200 response with this exact shape
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  // ─── B2C Result Callback ─────────────────────────────────────────────────────

  /**
   * Safaricom POSTs here after a B2C payout attempt succeeds or fails.
   */
  @Post('b2c-result')
  @HttpCode(HttpStatus.OK)
  async handleB2CResult(@Body() payload: any): Promise<{ ResultCode: number; ResultDesc: string }> {
    const result = payload?.Result;
    if (!result) {
      this.logger.warn('[B2C Result] Received malformed payload');
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    const { ConversationID, ResultCode, ResultDesc, ResultParameters } = result;
    this.logger.log(
      `[B2C Result] ConversationID=${ConversationID} ResultCode=${ResultCode}`,
    );

    const ctx = await this.pendingStore.getB2CPending(ConversationID);
    if (!ctx) {
      this.logger.warn(`[B2C Result] No pending context for ConversationID=${ConversationID}`);
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    const success = ResultCode === 0;

    if (success) {
      const params: Array<{ Key: string; Value: any }> =
        ResultParameters?.ResultParameter ?? [];
      const meta = Object.fromEntries(params.map((p) => [p.Key, p.Value]));

      const transactionId = meta['TransactionID'] ?? `b2c_${Date.now()}`;

      paymentsTotal.inc({ operation: 'mpesa_withdrawal', status: 'COMPLETED' });

      await this.rabbitService.publish('payment.completed', {
        paymentId: transactionId,
        type: 'WITHDRAWAL',
        provider: 'mpesa',
        userId: ctx.userId,
        userWalletAccountId: ctx.userWalletAccountId,
        amount: ctx.amount,
        currency: 'KES',
        phoneNumber: ctx.phoneNumber,
        referenceId: ctx.idempotencyKey,
      });

      await this.idempotencyService.saveKeyResponse(ctx.idempotencyKey, {
        status: 'COMPLETED',
        paymentId: transactionId,
        referenceId: ctx.idempotencyKey,
        amount: ctx.amount,
        currency: 'KES',
        provider: 'mpesa',
      });

      this.logger.log(`[B2C Result] ✅ Withdrawal COMPLETED — TxID=${transactionId}`);
    } else {
      paymentsTotal.inc({ operation: 'mpesa_withdrawal', status: 'FAILED' });

      await this.rabbitService.publish('payment.failed', {
        type: 'WITHDRAWAL',
        provider: 'mpesa',
        userId: ctx.userId,
        amount: ctx.amount,
        currency: 'KES',
        phoneNumber: ctx.phoneNumber,
        referenceId: ctx.idempotencyKey,
        reason: ResultDesc || 'B2C payout failed',
        resultCode: ResultCode,
      });

      await this.idempotencyService.saveKeyResponse(ctx.idempotencyKey, {
        status: 'FAILED',
        referenceId: ctx.idempotencyKey,
        error: ResultDesc,
        provider: 'mpesa',
      });

      this.logger.warn(`[B2C Result] ❌ Withdrawal FAILED — Code=${ResultCode} Desc="${ResultDesc}"`);
    }

    await this.pendingStore.deleteB2CPending(ConversationID);
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  // ─── B2C Timeout Callback ────────────────────────────────────────────────────

  /**
   * Safaricom POSTs here when a B2C payout request times out.
   */
  @Post('b2c-timeout')
  @HttpCode(HttpStatus.OK)
  async handleB2CTimeout(@Body() payload: any): Promise<{ ResultCode: number; ResultDesc: string }> {
    const result = payload?.Result;
    const conversationId = result?.ConversationID;

    this.logger.warn(`[B2C Timeout] ConversationID=${conversationId} — payout timed out`);

    if (conversationId) {
      const ctx = await this.pendingStore.getB2CPending(conversationId);
      if (ctx) {
        paymentsTotal.inc({ operation: 'mpesa_withdrawal', status: 'FAILED' });

        await this.rabbitService.publish('payment.failed', {
          type: 'WITHDRAWAL',
          provider: 'mpesa',
          userId: ctx.userId,
          amount: ctx.amount,
          currency: 'KES',
          phoneNumber: ctx.phoneNumber,
          referenceId: ctx.idempotencyKey,
          reason: 'B2C payout timed out — no response from Safaricom',
        });

        await this.idempotencyService.saveKeyResponse(ctx.idempotencyKey, {
          status: 'FAILED',
          referenceId: ctx.idempotencyKey,
          error: 'Timeout — M-Pesa did not confirm payout',
          provider: 'mpesa',
        });

        await this.pendingStore.deleteB2CPending(conversationId);
      }
    }

    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}
