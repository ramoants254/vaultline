import express from 'express';
import cors from 'cors';
import proxy from 'express-http-proxy';
import dotenv from 'dotenv';
import { correlationMiddleware } from './middleware/correlation.middleware.js';
import { verifyJwt } from './middleware/auth.middleware.js';
import { apiLimiter } from './middleware/rate-limiter.middleware.js';
import { httpRequestDuration, httpRequestsInFlight, httpRequestsTotal, prometheusClient } from './metrics.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// Enable Global Middlewares
app.use(cors());
app.use(correlationMiddleware);
app.use(apiLimiter);
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  httpRequestsInFlight.inc();
  res.on('finish', () => {
    const route = req.route?.path || req.path || 'unknown';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1e9);
    httpRequestsInFlight.dec();
  });
  next();
});

// Service Destination Endpoints
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
const LEDGER_URL = process.env.LEDGER_SERVICE_URL || 'http://localhost:4002';
const PAYMENTS_URL = process.env.PAYMENTS_SERVICE_URL || 'http://localhost:4003';
const FRAUD_URL = process.env.FRAUD_AUDIT_SERVICE_URL || 'http://localhost:4005';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    gateway: 'active',
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', prometheusClient.register.contentType);
  res.end(await prometheusClient.register.metrics());
});

// ROUTE 1: Auth Service (Public endpoints)
app.use('/api/v1/auth', proxy(AUTH_URL, {
  proxyReqPathResolver: (req) => `/auth${req.url}`,
}));

// ROUTE 2: Ledger Service (Protected by Gateway JWT check)
app.use('/api/v1/ledger', verifyJwt, proxy(LEDGER_URL, {
  proxyReqPathResolver: (req) => `/ledger${req.url}`,
}));

// ROUTE 3a: M-Pesa callbacks — PUBLIC (Safaricom servers POST here without JWT)
// Must be registered BEFORE the JWT-protected /api/v1/payments route.
const mpesaCallbackPaths = [
  '/api/v1/payments/mpesa/stk-callback',
  '/api/v1/payments/mpesa/b2c-result',
  '/api/v1/payments/mpesa/b2c-timeout',
];
mpesaCallbackPaths.forEach((callbackPath) => {
  app.use(callbackPath, proxy(PAYMENTS_URL, {
    proxyReqPathResolver: (req) => `/payments/mpesa/${callbackPath.split('/mpesa/')[1]}`,
  }));
});

// ROUTE 3b: Payments Service (Protected by Gateway JWT check)
app.use('/api/v1/payments', verifyJwt, proxy(PAYMENTS_URL, {
  proxyReqPathResolver: (req) => `/payments${req.url}`,
}));

// ROUTE 4: Fraud & Audit Service (Protected by Gateway JWT check)
app.use('/api/v1/fraud', verifyJwt, proxy(FRAUD_URL, {
  proxyReqPathResolver: (req) => req.url,
}));

app.listen(port, () => {
  console.log(`[API Gateway] Active at http://localhost:${port}`);
  console.log(` -> Proxying Auth:     http://localhost:${port}/api/v1/auth`);
  console.log(` -> Proxying Ledger:   http://localhost:${port}/api/v1/ledger`);
  console.log(` -> Proxying Payments: http://localhost:${port}/api/v1/payments`);
  console.log(` -> Proxying Fraud:    http://localhost:${port}/api/v1/fraud`);
});