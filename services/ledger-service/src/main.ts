import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { LedgerModule } from './ledger/ledger.module';
import * as dotenv from 'dotenv';
import { httpRequestDuration, httpRequestsInFlight, httpRequestsTotal, prometheusClient } from './metrics';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(LedgerModule);
  const http = app.getHttpAdapter().getInstance();
  http.use((req: any, res: any, next: any) => {
    const startedAt = process.hrtime.bigint();
    httpRequestsInFlight.inc();
    res.on('finish', () => {
      const labels = { method: req.method, route: req.route?.path || req.path || 'unknown', status_code: String(res.statusCode) };
      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
      httpRequestsInFlight.dec();
    });
    next();
  });
  http.get('/metrics', async (_req: any, res: any) => {
    res.setHeader('Content-Type', prometheusClient.register.contentType);
    res.end(await prometheusClient.register.metrics());
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT || 4002;
  await app.listen(port);
  console.log(`[Ledger Service] Running on port ${port}`);
}
bootstrap();