import amqp from 'amqplib';
import { rabbitmqEventsPublished } from '../metrics.js';

let channel: amqp.Channel | null = null;

export async function initRabbitMQ() {
  try {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    const connection = await amqp.connect(rabbitUrl);
    channel = await connection.createChannel();
    await channel.assertExchange('vaultline_events', 'topic', { durable: true });
    console.log('[Auth Service] Connected to RabbitMQ');
  } catch (error) {
    console.warn('[Auth Service] RabbitMQ connection deferred:', error);
  }
}

export async function publishEvent(routingKey: string, payload: object) {
  if (!channel) {
    console.log(`[Auth Event Log - Mock Published] ${routingKey}:`, JSON.stringify(payload));
    return;
  }
  try {
    channel.publish(
      'vaultline_events',
      routingKey,
      Buffer.from(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }))
    );
    rabbitmqEventsPublished.inc({ event_type: routingKey });
    console.log(`[Auth Event Published] ${routingKey}`);
  } catch (err) {
    console.error(`Failed to publish event ${routingKey}:`, err);
  }
}