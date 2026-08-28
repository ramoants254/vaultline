import express from 'express';
import dotenv from 'dotenv';
import { NotificationConsumer } from './consumers/notification.consumer.js';
import { httpRequestDuration, httpRequestsInFlight, httpRequestsTotal, prometheusClient } from './metrics.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4004;

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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'notification-service',
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', prometheusClient.register.contentType);
  res.end(await prometheusClient.register.metrics());
});

async function bootstrap() {
  const consumer = new NotificationConsumer();
  await consumer.start();

  app.listen(port, () => {
    console.log(`[Notification Service] Running on http://localhost:${port}`);
  });
}

bootstrap();