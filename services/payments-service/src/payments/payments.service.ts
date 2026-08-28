import { Injectable, BadRequestException } from '@nestjs/common';
import { RabbitMQService } from '../messaging/rabbitmq.service';
import { IdempotencyService } from '../redis/idempotency.service';
import { PaymentProviderService } from '../providers/payment-provider.service';
import { DepositDto, TransferDto } from './dto/payment.dto';
import { paymentsTotal } from '../metrics';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly rabbitService: RabbitMQService,
    private readonly idempotencyService: IdempotencyService,
    private readonly providerService: PaymentProviderService,
  ) {}

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
}