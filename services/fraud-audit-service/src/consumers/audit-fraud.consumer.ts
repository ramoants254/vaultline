import amqp from 'amqplib';
import { db } from '../db/index.js';
import { FraudRulesEngine } from '../rules/rules.engine.js';
import { VelocityTracker } from '../redis/velocity.tracker.js';
import { fraudAlertsTotal, rabbitmqEventsConsumed } from '../metrics.js';

export class AuditFraudConsumer {
  private channel: amqp.Channel | null = null;
  private rulesEngine = new FraudRulesEngine();

  async start() {
    try {
      const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
      const connection = await amqp.connect(rabbitUrl);
      this.channel = await connection.createChannel();

      await this.channel.assertExchange('vaultline_events', 'topic', { durable: true });
      const q = await this.channel.assertQueue('fraud_audit_events_queue', { durable: true });

      // Wildcard binding: Listen to ALL events across the system
      await this.channel.bindQueue(q.queue, 'vaultline_events', '#');

      console.log('[Fraud/Audit Service] Subscribed to wildcard events [#]');

      this.channel.consume(q.queue, async (msg) => {
        if (!msg) return;

        const routingKey = msg.fields.routingKey;
        const payload = JSON.parse(msg.content.toString());
        rabbitmqEventsConsumed.inc({ event_type: routingKey, result: 'received' });

        try {
          // 1. Immutable Audit Log Insertion
          const aggregateId = payload.userId || payload.paymentId || payload.referenceId || 'N/A';
          await db.query(
            `INSERT INTO audit_logs (event_type, aggregate_id, payload)
             VALUES ($1, $2, $3)`,
            [routingKey, aggregateId, JSON.stringify(payload)]
          );

          // 2. Fraud Check for Payment Events
          if (routingKey.startsWith('payment.')) {
            const userKey = payload.userId || payload.userWalletAccountId || 'anonymous';
            const velocityCount = await VelocityTracker.recordAndGetVelocity(userKey);

            const evaluation = await this.rulesEngine.evaluateTransaction({
              amount: Number(payload.amount) || 0,
              velocityCount,
            });

            if (evaluation.isSuspicious) {
              console.warn(`[FRAUD FLAGGED] Event: ${routingKey} | Rule: ${evaluation.ruleTriggered}`);
              fraudAlertsTotal.inc({ severity: evaluation.severity });

              // Store in fraud_alerts
              await db.query(
                `INSERT INTO fraud_alerts (reference_id, rule_triggered, severity, details)
                 VALUES ($1, $2, $3, $4)`,
                [
                  payload.referenceId || payload.paymentId || 'N/A',
                  evaluation.ruleTriggered,
                  evaluation.severity,
                  JSON.stringify(payload),
                ]
              );

              // 3. Emit fraud.flagged event
              await this.publishFraudEvent({
                referenceId: payload.referenceId || payload.paymentId,
                ruleTriggered: evaluation.ruleTriggered,
                severity: evaluation.severity,
                userId: payload.userId,
                amount: payload.amount,
              });
            }
          }

          this.channel?.ack(msg);
        } catch (err) {
          rabbitmqEventsConsumed.inc({ event_type: routingKey, result: 'failed' });
          console.error(`Error processing audit/fraud event ${routingKey}:`, err);
          this.channel?.nack(msg, false, false);
        }
      });
    } catch (err) {
      console.error('[Fraud/Audit Service] RabbitMQ Connection failed:', err);
    }
  }

  private async publishFraudEvent(alertData: any) {
    if (!this.channel) return;
    this.channel.publish(
      'vaultline_events',
      'fraud.flagged',
      Buffer.from(JSON.stringify({ ...alertData, timestamp: new Date().toISOString() }))
    );
    console.log(`[Event Emitted] fraud.flagged - Ref: ${alertData.referenceId}`);
  }
}