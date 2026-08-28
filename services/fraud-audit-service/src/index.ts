import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './db/index.js';
import { AuditFraudConsumer } from './consumers/audit-fraud.consumer.js';
import { httpRequestDuration, httpRequestsInFlight, httpRequestsTotal, prometheusClient } from './metrics.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4005;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  httpRequestsInFlight.inc();
  res.on('finish', () => {
    const labels = { method: req.method, route: req.path, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
    httpRequestsInFlight.dec();
  });
  next();
});

// GET /audit-logs - Query immutable system audit trail
app.get('/audit-logs', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, event_type, aggregate_id, payload, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ count: result.rows.length, logs: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// GET /fraud-alerts - Query flagged fraud entries
app.get('/fraud-alerts', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, reference_id, rule_triggered, severity, details, created_at FROM fraud_alerts ORDER BY created_at DESC'
    );
    res.json({ count: result.rows.length, alerts: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch fraud alerts' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'fraud-audit-service', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', prometheusClient.register.contentType);
  res.end(await prometheusClient.register.metrics());
});

async function bootstrap() {
  const consumer = new AuditFraudConsumer();
  await consumer.start();

  app.listen(port, () => {
    console.log(`[Fraud & Audit Service] Running on http://localhost:${port}`);
  });
}

bootstrap();