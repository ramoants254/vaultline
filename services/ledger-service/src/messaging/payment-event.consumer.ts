import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import amqp from 'amqplib';
import { LedgerService } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/dto/ledger.dto';
import { journalEntriesTotal, rabbitmqEventsConsumed } from '../metrics';

@Injectable()
export class PaymentEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentEventConsumer.name);
  private connection: any;
  private channel: any;

  constructor(private readonly ledgerService: LedgerService) {}

  async onModuleInit() {
    try {
      const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange('vaultline_events', 'topic', { durable: true });
      const q = await this.channel.assertQueue('ledger_payment_events', { durable: true });

      // Bind queue to payment.completed events
      await this.channel.bindQueue(q.queue, 'vaultline_events', 'payment.completed');

      this.logger.log('Listening for payment.completed events...');

      this.channel.consume(q.queue, async (msg: any) => {
        if (!msg) return;

        try {
          const content = JSON.parse(msg.content.toString());
          rabbitmqEventsConsumed.inc({ event_type: 'payment.completed', result: 'received' });
          this.logger.log(`Received event payment.completed (Ref: ${content.referenceId})`);

          if (content.type === 'DEPOSIT') {
            await this.ledgerService.postJournalEntry({
              referenceId: content.referenceId,
              description: `Deposit via payment ${content.paymentId}`,
              entries: [
                { accountId: content.clearingAccountId, direction: EntryDirection.DEBIT, amount: content.amount },
                { accountId: content.userWalletAccountId, direction: EntryDirection.CREDIT, amount: content.amount },
              ],
            });
            this.logger.log(`Successfully updated ledger for deposit ${content.referenceId}`);
            journalEntriesTotal.inc({ result: 'success' });
          } else if (content.type === 'TRANSFER') {
            await this.ledgerService.postJournalEntry({
              referenceId: content.referenceId,
              description: `P2P Transfer ${content.paymentId}`,
              entries: [
                { accountId: content.senderWalletAccountId, direction: EntryDirection.DEBIT, amount: content.amount },
                { accountId: content.recipientWalletAccountId, direction: EntryDirection.CREDIT, amount: content.amount },
              ],
            });
            this.logger.log(`Successfully updated ledger for transfer ${content.referenceId}`);
            journalEntriesTotal.inc({ result: 'success' });
          }

          this.channel.ack(msg);
        } catch (err) {
          rabbitmqEventsConsumed.inc({ event_type: 'payment.completed', result: 'failed' });
          journalEntriesTotal.inc({ result: 'failed' });
          this.logger.error('Error processing payment event in Ledger:', err);
          this.channel.nack(msg, false, false); // Send to DLQ/discard to prevent infinite loops
        }
      });
    } catch (err) {
      this.logger.error('Failed to initialize RabbitMQ Consumer in Ledger Service:', err);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}