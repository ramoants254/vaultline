import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { RabbitMQService } from '../messaging/rabbitmq.service';
import { IdempotencyService } from '../redis/idempotency.service';
import { PaymentProviderService } from '../providers/payment-provider.service';
import { MpesaService } from '../mpesa/mpesa.service';
import { MpesaPendingStore } from '../mpesa/mpesa-pending.store';
import { DepositDto, TransferDto } from './dto/payment.dto';
import { MpesaDepositDto, MpesaWithdrawalDto } from '../mpesa/dto/mpesa.dto';
import { paymentsTotal } from '../metrics';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly rabbitService: RabbitMQService,
    private readonly idempotencyService: IdempotencyService,
    private readonly providerService: PaymentProviderService,
    private readonly mpesaService: MpesaService,
    private readonly mpesaPendingStore: MpesaPendingStore,
  ) {}

  // ─── Existing Card/Stripe Deposit ─────────────────────────────────────────

  async processDeposit(dto: DepositDto, idempotencyKey: string) {
    // 1. Idempotency Check
    const cachedResponse = await this.idempotencyService.verifyAndLockKey(idempotencyKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    // 2. Call Payment Gateway
    const gatewayResult = await this.providerService.processExternalDeposit(
      dto.amount,
      dto.currency,
      dto.paymentMethodToken,
    );

    let result;

    if (gatewayResult.success) {
      paymentsTotal.inc({ operation: 'deposit', status: 'COMPLETED' });
      result = {
        status: 'COMPLETED',
        paymentId: gatewayResult.transactionId,
        referenceId: idempotencyKey,
        amount: dto.amount,
        currency: dto.currency,
      };

      // 3. Emit payment.completed event to RabbitMQ
      await this.rabbitService.publish('payment.completed', {
        paymentId: gatewayResult.transactionId,
        type: 'DEPOSIT',
        userId: dto.userId,
        clearingAccountId: dto.clearingAccountId,
        userWalletAccountId: dto.userWalletAccountId,
        amount: dto.amount,
        currency: dto.currency,
        referenceId: idempotencyKey,
      });
    } else {
      paymentsTotal.inc({ operation: 'deposit', status: 'FAILED' });
      result = {
        status: 'FAILED',
        error: gatewayResult.errorMessage,
        referenceId: idempotencyKey,
      };

      // Emit payment.failed event
      await this.rabbitService.publish('payment.failed', {
        type: 'DEPOSIT',
        userId: dto.userId,
        amount: dto.amount,
        referenceId: idempotencyKey,
        reason: gatewayResult.errorMessage,
      });
    }

    // 4. Save response in Redis for idempotency cache
    await this.idempotencyService.saveKeyResponse(idempotencyKey, result);

    if (!gatewayResult.success) {
      throw new BadRequestException(`Payment failed: ${gatewayResult.errorMessage}`);
    }

    return result;
  }

  async processTransfer(dto: TransferDto, idempotencyKey: string) {
    const cachedResponse = await this.idempotencyService.verifyAndLockKey(idempotencyKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const transferId = `tr_${Date.now()}`;
    const result = {
      status: 'COMPLETED',
      paymentId: transferId,
      referenceId: idempotencyKey,
      amount: dto.amount,
    };
    paymentsTotal.inc({ operation: 'transfer', status: 'COMPLETED' });

    // Emit payment.completed event for peer-to-peer transfer
    await this.rabbitService.publish('payment.completed', {
      paymentId: transferId,
      type: 'TRANSFER',
      senderWalletAccountId: dto.senderWalletAccountId,
      recipientWalletAccountId: dto.recipientWalletAccountId,
      amount: dto.amount,
      currency: dto.currency,
      referenceId: idempotencyKey,
    });

    await this.idempotencyService.saveKeyResponse(idempotencyKey, result);
    return result;
  }

  // ─── M-Pesa STK Push Deposit ───────────────────────────────────────────────

  /**
   * Initiates a Safaricom STK Push USSD prompt on the customer's phone.
   *
   * Flow:
   *   1. Idempotency check (prevents double-initiation)
   *   2. Call MpesaService.stkPush() → Daraja API
   *   3. Store pending context in Redis (keyed by CheckoutRequestID)
   *   4. Return immediately — actual confirmation arrives asynchronously
   *      via MpesaCallbackController.handleStkCallback()
   */
  async initiateMpesaDeposit(dto: MpesaDepositDto, idempotencyKey: string) {
    // 1. Idempotency check
    const cached = await this.idempotencyService.verifyAndLockKey(idempotencyKey);
    if (cached) {
      return cached;
    }

    this.logger.log(
      `[PaymentsService] Initiating M-Pesa STK Push for ${dto.phoneNumber} — KES ${dto.amount}`,
    );

    // 2. Trigger STK Push
    const stkResult = await this.mpesaService.stkPush(
      dto.phoneNumber,
      dto.amount,
      'VaultlineDeposit',
      idempotencyKey,
    );

    if (!stkResult.success) {
      // Release the idempotency lock by saving a FAILED state
      const failResult = {
        status: 'FAILED',
        referenceId: idempotencyKey,
        error: stkResult.errorMessage,
        provider: 'mpesa',
      };
      await this.idempotencyService.saveKeyResponse(idempotencyKey, failResult);
      paymentsTotal.inc({ operation: 'mpesa_deposit', status: 'FAILED' });

      await this.rabbitService.publish('payment.failed', {
        type: 'DEPOSIT',
        provider: 'mpesa',
        userId: dto.userId,
        amount: dto.amount,
        currency: 'KES',
        phoneNumber: dto.phoneNumber,
        referenceId: idempotencyKey,
        reason: stkResult.errorMessage,
      });

      throw new BadRequestException(
        `M-Pesa STK Push failed: ${stkResult.errorMessage}`,
      );
    }

    // 3. Persist pending context so the callback controller can resolve it
    await this.mpesaPendingStore.saveStkPending(stkResult.checkoutRequestId!, {
      idempotencyKey,
      userId: dto.userId,
      clearingAccountId: dto.clearingAccountId,
      userWalletAccountId: dto.userWalletAccountId,
      amount: dto.amount,
      phoneNumber: dto.phoneNumber,
      initiatedAt: new Date().toISOString(),
    });

    // 4. Return a pending acknowledgement — not yet COMPLETED
    return {
      status: 'PENDING',
      provider: 'mpesa',
      message: 'STK Push sent. Please complete the M-Pesa prompt on your phone.',
      checkoutRequestId: stkResult.checkoutRequestId,
      merchantRequestId: stkResult.merchantRequestId,
      referenceId: idempotencyKey,
      amount: dto.amount,
      currency: 'KES',
      phoneNumber: dto.phoneNumber,
    };
  }

  // ─── M-Pesa B2C Withdrawal ────────────────────────────────────────────────

  /**
   * Initiates an M-Pesa B2C payout (Vaultline shortcode → customer's wallet).
   *
   * Flow:
   *   1. Idempotency check
   *   2. Call MpesaService.b2cPayout() → Daraja API
   *   3. Store pending context in Redis (keyed by ConversationID)
   *   4. Return immediately — result arrives via MpesaCallbackController.handleB2CResult()
   */
  async initiateMpesaWithdrawal(dto: MpesaWithdrawalDto, idempotencyKey: string) {
    const cached = await this.idempotencyService.verifyAndLockKey(idempotencyKey);
    if (cached) {
      return cached;
    }

    this.logger.log(
      `[PaymentsService] Initiating M-Pesa B2C payout to ${dto.phoneNumber} — KES ${dto.amount}`,
    );

    const b2cResult = await this.mpesaService.b2cPayout(
      dto.phoneNumber,
      dto.amount,
      dto.remarks,
    );

    if (!b2cResult.success) {
      const failResult = {
        status: 'FAILED',
        referenceId: idempotencyKey,
        error: b2cResult.errorMessage,
        provider: 'mpesa',
      };
      await this.idempotencyService.saveKeyResponse(idempotencyKey, failResult);
      paymentsTotal.inc({ operation: 'mpesa_withdrawal', status: 'FAILED' });

      await this.rabbitService.publish('payment.failed', {
        type: 'WITHDRAWAL',
        provider: 'mpesa',
        userId: dto.userId,
        amount: dto.amount,
        currency: 'KES',
        phoneNumber: dto.phoneNumber,
        referenceId: idempotencyKey,
        reason: b2cResult.errorMessage,
      });

      throw new BadRequestException(
        `M-Pesa B2C payout failed: ${b2cResult.errorMessage}`,
      );
    }

    await this.mpesaPendingStore.saveB2CPending(b2cResult.conversationId!, {
      idempotencyKey,
      userId: dto.userId,
      userWalletAccountId: dto.userWalletAccountId,
      amount: dto.amount,
      phoneNumber: dto.phoneNumber,
      initiatedAt: new Date().toISOString(),
    });

    return {
      status: 'PENDING',
      provider: 'mpesa',
      message: 'M-Pesa payout queued. Funds will be sent to your M-Pesa wallet shortly.',
      conversationId: b2cResult.conversationId,
      originatorConversationId: b2cResult.originatorConversationId,
      referenceId: idempotencyKey,
      amount: dto.amount,
      currency: 'KES',
      phoneNumber: dto.phoneNumber,
    };
  }
}