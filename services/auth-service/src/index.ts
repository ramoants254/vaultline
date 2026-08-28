import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { authRoutes } from './routes/auth.routes.js';
import { initRabbitMQ } from './events/publisher.js';
import { httpRequestDuration, httpRequestsInFlight, httpRequestsTotal, prometheusClient } from './metrics.js';

dotenv.config();

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, { origin: '*' });

  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'fallback-secret',
  });

  app.addHook('onRequest', async (request) => {
    httpRequestsInFlight.inc();
    (request as any).metricsStartedAt = process.hrtime.bigint();
  });
  app.addHook('onResponse', async (request, reply) => {
    const labels = { method: request.method, route: request.routeOptions.url || 'unknown', status_code: String(reply.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, Number(process.hrtime.bigint() - (request as any).metricsStartedAt) / 1e9);
    httpRequestsInFlight.dec();
  });

  // Authentication decorator for Fastify
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or missing access token' });
    }
  });

  // Register Routes
  await app.register(authRoutes, { prefix: '/auth' });

  // Health check endpoint
  app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));
  app.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', prometheusClient.register.contentType);
    return prometheusClient.register.metrics();
  });

  await initRabbitMQ();

  const port = Number(process.env.PORT) || 4001;
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`[Auth Service] Running on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();