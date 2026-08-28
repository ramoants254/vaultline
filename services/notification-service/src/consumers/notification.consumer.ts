import amqp from 'amqplib';
import { EmailProvider } from '../providers/email.provider.js';
import { SmsProvider } from '../providers/sms.provider.js';
import { rabbitmqEventsConsumed } from '../metrics.js';

export class NotificationConsumer {
  private channel: amqp.Channel | null = null;

  async start() {
    try {
      const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      const connection = await amqp.connect(rabbitUrl);
      this.channel = await connection.createChannel();

      await this.channel.assertExchange('vaultline_events', 'topic', { durable: true });
      const q = await this.channel.assertQueue('notification_events_queue', { durable: true });

      // Bind all relevant event topics
      const topics = [
        'user.registered',
        'payment.completed',
        'payment.failed',
        'fraud.flagged',
      ];

      for (const topic of topics) {
        await this.channel.bindQueue(q.queue, 'vaultline_events', topic);
      }

      console.log('[Notification Service] Subscribed to events: ' + topics.join(', '));

      this.channel.consume(q.queue, async (msg) => {
        if (!msg) return;

        const routingKey = msg.fields.routingKey;
        const payload = JSON.parse(msg.content.toString());
        rabbitmqEventsConsumed.inc({ event_type: routingKey, result: 'received' });

        try {
          console.log(`[Notification Consumer] Processing event [${routingKey}]`);
          await this.handleEvent(routingKey, payload);
          this.channel?.ack(msg);
        } catch (err) {
          rabbitmqEventsConsumed.inc({ event_type: routingKey, result: 'failed' });
          console.error(`Error processing notification event ${routingKey}:`, err);
          this.channel?.nack(msg, false, false);
        }
      });
    } catch (err) {
      console.error('[Notification Service] RabbitMQ Connection failed:', err);
    }
  }

  private async handleEvent(routingKey: string, payload: any) {
    switch (routingKey) {
      case 'user.registered':
        await EmailProvider.sendEmail({
          to: payload.email,
          subject: 'Welcome to Vaultline!',
          body: `Hi ${payload.fullName},\n\nYour account has been created successfully. Welcome aboard!`,
        });
        break;

      case 'payment.completed':
        const recipient = payload.userId ? `${payload.userId}@user.vaultline.com` : 'user@example.com';
        await EmailProvider.sendEmail({
          to: recipient,
          subject: 'Payment Transaction Completed',
          body: `Your ${payload.type} payment of ${payload.amount} ${payload.currency} was completed successfully.\nReference: ${payload.referenceId}`,
        });

        await SmsProvider.sendSms({
          to: '+1000000000',
          message: `Vaultline: ${payload.type} of ${payload.amount} ${payload.currency} successful. Ref: ${payload.referenceId}`,
        });
        break;

      case 'payment.failed':
        await EmailProvider.sendEmail({
          to: 'user@example.com',
          subject: 'Payment Transaction Failed',
          body: `Your payment of ${payload.amount} failed.\nReason: ${payload.reason}`,
        });
        break;

      case 'fraud.flagged':
        await EmailProvider.sendEmail({
          to: 'security@vaultline.com',
          subject: 'URGENT: Suspicious Activity Detected',
          body: `Suspicious activity flagged on transaction ${payload.referenceId}. Rule: ${payload.ruleTriggered}`,
        });
        break;

      default:
        console.warn(`Unhandled notification topic: ${routingKey}`);
    }
  }
}