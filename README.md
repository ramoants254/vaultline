# Vaultline 🏦

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-v14%2F16-black.svg)](https://nextjs.org)
[![NestJS](https://img.shields.io/badge/NestJS-v10-red.svg)](https://nestjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v16-blue.svg)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-v7-red.svg)](https://redis.io)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-v3-orange.svg)](https://www.rabbitmq.com)
[![M-Pesa](https://img.shields.io/badge/M--Pesa-Daraja_API-green.svg)](https://developer.safaricom.co.ke)

> *A distributed fintech platform built because "just use Stripe" wasn't interesting enough.*

Vaultline is a full-stack, production-grade banking platform monorepo. Under the hood: an API Gateway routing to 5 microservices, double-entry accounting enforced at the database level, Redis idempotency locks so nobody gets charged twice, an event-driven pipeline over RabbitMQ, real-time fraud detection, and an M-Pesa Daraja integration for mobile money — all wrapped in a glassmorphism dark-mode dashboard that slaps.

---

## What's inside?

| Piece | Tech | Job |
|---|---|---|
| `web` | Next.js 16, React 19, Vanilla CSS | The dashboard — glassmorphism UI, live transaction feeds, fraud alerts, auth flows |
| `gateway` | Express.js, TypeScript | The front door — JWT verification, rate limiting, correlation IDs, proxying |
| `services/auth-service` | Express.js, PostgreSQL, Redis | Who are you? — Argon2id hashing, JWT issuance, refresh token blacklisting |
| `services/ledger-service` | NestJS, PostgreSQL | The accountant — double-entry journals, SERIALIZABLE isolation, balance tracking |
| `services/payments-service` | NestJS, Redis, RabbitMQ | Money moves — card deposits, M-Pesa STK Push, B2C payouts, idempotency |
| `services/fraud-audit-service` | Express.js, PostgreSQL | The suspicious one — rule engine, velocity checks, immutable audit logs |
| `services/notification-service` | NestJS, RabbitMQ | Keeps you posted — transaction receipts, alerts, real-time dispatches |

---

## Architecture

Every client request hits the **API Gateway** first, which checks your JWT, slaps a correlation ID on the request, and proxies it to the right microservice. Payments publish events to a RabbitMQ topic exchange, and three separate consumers (Ledger, Fraud, Notifications) pick them up independently. Nobody is waiting on anybody.

```
                    ┌────────────────────────────┐
                    │   Next.js Dashboard :3000  │
                    └─────────────┬──────────────┘
                                  │ REST / JWT
                                  ▼
                    ┌────────────────────────────┐
                    │    API Gateway  :8000      │
                    │  JWT · Rate Limit · CORS   │
                    └────┬─────────┬────────┬────┘
                         │         │        │
              ┌──────────┘         │        └──────────┐
              ▼                    ▼                    ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │  Auth  :4001     │  │  Ledger  :4002   │  │ Payments :4003   │
   │  Argon2 · JWT    │  │  SERIALIZABLE Tx │  │ M-Pesa · Stripe  │
   │  PostgreSQL      │  │  PostgreSQL      │  │ Redis · RabbitMQ │
   └──────────────────┘  └──────────────────┘  └────────┬─────────┘
                                                         │
                                              Events (AMQP)
                                                         ▼
                                           ┌─────────────────────┐
                                           │  RabbitMQ Broker    │
                                           │  vaultline_events   │
                                           │  payment.completed  │
                                           │  payment.failed     │
                                           └──────┬──────────────┘
                                                  │
                              ┌───────────────────┴──────────────────┐
                              ▼                                       ▼
                   ┌──────────────────────┐             ┌──────────────────────┐
                   │ Fraud-Audit  :4005   │             │ Notification :4004   │
                   │ Rule engine          │             │ Receipts · Alerts    │
                   │ PostgreSQL           │             │ RabbitMQ consumer    │
                   └──────────────────────┘             └──────────────────────┘
```

---

## What actually makes this interesting

### 🧾 Double-Entry Accounting — for real
Every money movement creates a balanced journal entry: `DEBIT == CREDIT`, always. This isn't a "balance" column in a users table. The Ledger Service enforces the accounting invariant at the database level using `SERIALIZABLE` isolation and row-level `FOR UPDATE` locks. You cannot overdraft. You cannot have a race condition sneak in a phantom read. PostgreSQL will fight you.

### 🔁 Idempotency — no double charges, ever
Every payment endpoint requires an `X-Idempotency-Key` header. The payments service sets a Redis `LOCKED` sentinel before processing, then replaces it with the cached result. Hit the same endpoint with the same key twice? You get the same response. Your webhook retry loop is not our problem.

### 📨 Event-Driven — loose coupling, high throughput
Payments don't call Ledger. They don't call Fraud. They don't call Notifications. They publish one event to the `vaultline_events` RabbitMQ exchange and go home. Three consumers pick it up independently and do their thing. Scale any of them without touching payments. Outage in Notifications? Ledger doesn't care.

### 📱 M-Pesa Daraja — mobile money, properly
Not a stub. Not a TODO. The Payments Service has a full Daraja integration:
- **STK Push** — triggers a USSD prompt on the customer's phone
- **B2C Payouts** — sends money from the business shortcode back to a customer's M-Pesa wallet
- **OAuth token caching** — the Daraja access token is cached in Redis for 55 minutes so we're not re-authenticating on every request
- **Async callback handling** — Safaricom's servers POST back to `/api/v1/payments/mpesa/stk-callback` (no JWT, whitelisted at the gateway), which resolves the pending context from Redis and fires the same `payment.completed` event into RabbitMQ as any other payment

### 🚨 Fraud Detection — async, not in the way
The Fraud-Audit Service consumes every payment event and runs it through a velocity rule engine (high-frequency deposits, extreme amounts, suspicious patterns). Alerts are tagged `HIGH`, `MEDIUM`, or `LOW`. All of this happens after the payment — it doesn't slow down the happy path.

### 🔒 Security that actually thought about things
- Passwords hashed with **Argon2id** (not bcrypt, not SHA-256)
- Short-lived JWT access tokens + Redis-blacklisted refresh tokens
- Gateway-level rate limiting backed by Redis (not in-memory, survives restarts)
- Correlation IDs on every request, propagated through the entire chain

---

## Getting it running

### Option A — just Docker

Spins everything up: Postgres (×3 isolated DBs), Redis, RabbitMQ, 5 microservices, gateway, and the Next.js dashboard.

```bash
docker compose up --build -d
npm run migrate:all
```

Then open:
- **Dashboard** → `http://localhost:3000`
- **API Gateway** → `http://localhost:8000`
- **RabbitMQ console** → `http://localhost:15672` · `vaultline_mq` / `mq_secret_pass`
- **Grafana** → `http://localhost:3001` · `admin` / `admin`
- **Prometheus** → `http://localhost:9090`

> Account numbers are generated by the Ledger Service in `VL` + 10-digit format. Don't try to make one up in the browser.

### Option B — local dev with hot-reload

Keep infra in Docker, run services locally with TypeScript watch mode:

```bash
npm run infra:up      # Postgres, Redis, RabbitMQ in Docker
npm run migrate:all   # Run DB migrations
npm run dev:all       # All services + dashboard with hot-reload
```

---

## M-Pesa Setup

To use the M-Pesa integration you'll need:

1. **A Daraja app** — free account at [developer.safaricom.co.ke](https://developer.safaricom.co.ke). Grab your `Consumer Key` and `Consumer Secret`.

2. **A public callback URL** — Safaricom's servers need to reach yours. In development, `ngrok` is your friend:
   ```bash
   ngrok http 8000
   ```

3. **Fill in `.env`**:
   ```env
   MPESA_CONSUMER_KEY=your_key
   MPESA_CONSUMER_SECRET=your_secret
   MPESA_SHORTCODE=174379          # sandbox default
   MPESA_PASSKEY=bfb279f9aa9...    # sandbox default (pre-filled)
   MPESA_CALLBACK_BASE_URL=https://your-ngrok-url.ngrok.io
   MPESA_ENVIRONMENT=sandbox
   ```

4. **Test it** — Safaricom's sandbox test number is `254708374149`. It won't actually ring anyone's phone.

**Deposit flow:**
```
POST /api/v1/payments/mpesa/deposit
X-Idempotency-Key: <uuid>
{ "phoneNumber": "254708374149", "amount": 500, ... }

→ Returns { status: "PENDING", checkoutRequestId: "ws_CO_..." }
→ Safaricom POSTs back to /api/v1/payments/mpesa/stk-callback
→ payment.completed fires on RabbitMQ
→ Ledger posts the entry, Fraud checks it, Notification sends receipt
```

---

## API Reference

All routes go through `http://localhost:8000`.

### Auth — no JWT needed
```
POST /api/v1/auth/register      Create an account
POST /api/v1/auth/login         Get access + refresh tokens
POST /api/v1/auth/logout        Blacklist the refresh token
```

### Ledger — JWT required
```
POST /api/v1/ledger/accounts              Create a wallet account (ASSET, LIABILITY…)
GET  /api/v1/ledger/accounts              Your accounts
GET  /api/v1/ledger/accounts/:id/balance  Balance + metadata
GET  /api/v1/ledger/accounts/:id/history  Full double-entry history
POST /api/v1/ledger/entries               Post a raw journal entry
```

### Payments — JWT + X-Idempotency-Key required
```
POST /api/v1/payments/deposit           Card/external deposit
POST /api/v1/payments/transfer          Peer-to-peer transfer
POST /api/v1/payments/mpesa/deposit     M-Pesa STK Push (async)
POST /api/v1/payments/mpesa/withdraw    M-Pesa B2C payout (async)
```

### Fraud & Audit — JWT required
```
GET /api/v1/fraud/fraud-alerts    Detected alerts with severity ratings
GET /api/v1/fraud/audit-logs      Immutable system event log
```

### M-Pesa Callbacks — public (Safaricom posts here, no JWT)
```
POST /api/v1/payments/mpesa/stk-callback   STK Push result
POST /api/v1/payments/mpesa/b2c-result     B2C payout result
POST /api/v1/payments/mpesa/b2c-timeout    B2C timeout
```

---

## Monorepo commands

```bash
npm run setup         # Install deps + start Docker infra
npm run dev:all       # Everything, hot-reload
npm run dev:web       # Just the Next.js frontend
npm run build:all     # TypeScript build across all services
npm run migrate:all   # Run DB migrations (Auth, Ledger, Fraud)
npm run infra:up      # docker compose up -d
npm run infra:down    # docker compose down
npm run infra:reset   # Nuke volumes, fresh DBs
npm run test:all      # Run test suites
```

---

## Observability

Every service exposes `/health` and `/metrics`. The Docker stack ships with Prometheus scraping all of them and a pre-provisioned Grafana dashboard.

```bash
# Is everything alive?
curl http://localhost:8000/health

# Are queues draining?
docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers

# Follow the money through service logs
docker compose logs --since=5m payments-service ledger-service fraud-audit-service notification-service

# Overall container health
docker compose ps
```

Queues should drain to zero after every payment. If they don't, something is unhappy and the logs will tell you what.

---

## Tech stack

| Layer | Choices |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Vanilla CSS (HSL tokens, glassmorphism) |
| **Backend** | NestJS (Ledger, Payments, Notifications), Express.js (Auth, Fraud, Gateway) |
| **Databases** | PostgreSQL 16 — one isolated schema per service |
| **Cache / Locks** | Redis 7 — idempotency keys, token blacklist, M-Pesa OAuth cache |
| **Messaging** | RabbitMQ 3.x — AMQP topic exchange, durable queues |
| **Mobile Money** | Safaricom M-Pesa Daraja API — STK Push + B2C |
| **Auth** | Argon2id, JWT (access + refresh), Redis blacklisting |
| **Observability** | Prometheus + Grafana, per-service `/metrics` endpoints |
| **Infrastructure** | Docker, Docker Compose |

---

## License

MIT — do whatever you want with it.
