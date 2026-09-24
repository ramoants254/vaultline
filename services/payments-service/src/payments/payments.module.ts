import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderService } from '../providers/payment-provider.service';
import { IdempotencyService } from '../redis/idempotency.service';
import { RabbitMQService } from '../messaging/rabbitmq.service';
import { HealthController } from '../health/health.controller';
import { MpesaService } from '../mpesa/mpesa.service';
import { MpesaPendingStore } from '../mpesa/mpesa-pending.store';
import { MpesaCallbackController } from '../mpesa/mpesa-callback.controller';

@Module({
  controllers: [PaymentsController, MpesaCallbackController, HealthController],
  providers: [
    PaymentsService,
    PaymentProviderService,
    IdempotencyService,
    RabbitMQService,
    MpesaService,
    MpesaPendingStore,
  ],
})
export class PaymentsModule {}