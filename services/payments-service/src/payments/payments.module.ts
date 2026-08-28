import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProviderService } from '../providers/payment-provider.service';
import { IdempotencyService } from '../redis/idempotency.service';
import { RabbitMQService } from '../messaging/rabbitmq.service';
import { HealthController } from '../health/health.controller';

@Module({
  controllers: [PaymentsController, HealthController],
  providers: [PaymentsService, PaymentProviderService, IdempotencyService, RabbitMQService],
})
export class PaymentsModule {}