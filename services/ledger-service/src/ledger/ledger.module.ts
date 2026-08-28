import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { databaseProviders } from '../database/database.provider';
import { PaymentEventConsumer } from '../messaging/payment-event.consumer';
import { HealthController } from '../health/health.controller';

@Module({
  controllers: [LedgerController, HealthController],
  providers: [...databaseProviders, LedgerService, PaymentEventConsumer],
  exports: [LedgerService],
})
export class LedgerModule {}