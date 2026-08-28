import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import amqp from 'amqplib';
import { rabbitmqEventsPublished } from '../metrics';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: any;
  private channel: any;

  async onModuleInit() {
    try {
      const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      this.connection = await amqp.connect(rabbitUrl);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange('vaultline_events', 'topic', { durable: true });
      this.logger.log('Connected to RabbitMQ Exchange [vaultline_events]');
    } catch (error) {
      this.logger.error('RabbitMQ connection failed:', error);
    }
  }

  async publish(routingKey: string, payload: any) {
    if (!this.channel) {
      this.logger.warn(`RabbitMQ not connected. Skipped publishing: ${routingKey}`);
      return;
    }

    const event = {
      ...payload,
      timestamp: new Date().toISOString(),
    };

    this.channel.publish(
      'vaultline_events',
      routingKey,
      Buffer.from(JSON.stringify(event)),
      {
        headers: {
          'x-correlation-id': payload.correlationId || payload.referenceId || 'N/A',
        },
      }
    );
    rabbitmqEventsPublished.inc({ event_type: routingKey });
    this.logger.log(`Event published: [${routingKey}] - Ref: ${payload.referenceId || payload.paymentId}`);
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }
}