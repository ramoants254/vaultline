# 🏦 Vaultline Fintech Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org)
[![Next.js](https://img.shields.io/badge/Next.js-v14%2F16-black.svg)](https://nextjs.org)
[![NestJS](https://img.shields.io/badge/NestJS-v10-red.svg)](https://nestjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v16-blue.svg)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-v7-red.svg)](https://redis.io)
[![RabbitMQ](https://img.shields.io/badge/RabbitMQ-v3-orange.svg)](https://www.rabbitmq.com)

**Vaultline** is a modern, high-concurrency distributed fintech banking platform built as a monorepo. It features an API Gateway, 5 microservices, asynchronous RabbitMQ message queues, Redis-backed idempotency & token management, PostgreSQL double-entry accounting with `SERIALIZABLE` isolation, real-time fraud monitoring, and an executive Next.js dark-mode dashboard.

---

## 📐 Architecture Overview

```
                          ┌─────────────────────────────┐
                          │   Next.js 14/16 Dashboard   │
                          │     (http://localhost:3000) │
                          └──────────────┬──────────────┘
                                         │ REST API / JWT
                                         ▼
                          ┌─────────────────────────────┐
                          │      Express API Gateway    │
                          │     (http://localhost:8000) │
                          └──────┬───────┬───────┬──────┘
                                 │       │       │
             ┌───────────────────┘       │       └───────────────────┐
             ▼                           ▼                           ▼
  ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
  │   Auth Service   │        │  Ledger Service  │        │ Payments Service │
  │    (Port 4001)   │        │    (Port 4002)   │        │    (Port 4003)   │
  └────────┬─────────┘        └────────┬─────────┘        └────────┬─────────┘
           │                           │                           │
           │ Argon2 / JWT              │ SERIALIZABLE Tx           │ Redis Idempotency
           ▼                           ▼                           ▼
  ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
  │ Auth PostgreSQL  │        │ Ledger PostgreSQL│        │ Payments Redis   │
  └──────────────────┘        └──────────────────┘        └────────┬─────────┘
                                                                   │
                                                                   │ Events (AMQP)
                                                                   ▼
                                                       ┌──────────────────────┐
                                                       │   RabbitMQ Broker    │
                                                       │  payment.completed   │
                                                       │    payment.failed    │
                                                       └──────────┬───────────┘
                                                                  │
                                            ┌─────────────────────┴─────────────────────┐
                                            ▼                                           ▼
                                 ┌────────────────────┐                      ┌────────────────────┐
                                 │ Fraud-Audit Service│                      │Notification Service│
                                 │    (Port 4005)     │                      │    (Port 4004)     │
                                 └─────────┬──────────┘                      └────────────────────┘
                                           │
```

---

## 🌟 Key System Highlights

1. **Strict Double-Entry Accounting Invariant**:
   - The Ledger Service enforces `Total DEBIT == Total CREDIT` on every journal entry transaction line.
   - Executes under **PostgreSQL `SERIALIZABLE` isolation** with explicit row locks (`FOR UPDATE`) to guarantee zero race conditions and enforce non-negative wallet constraints (`CHECK (balance >= 0)`).

2. **Idempotency Guarantee**:

3. **Event-Driven Architecture**:
   - Decoupled event publication via RabbitMQ queues. Payment events (`payment.completed`, `payment.failed`) automatically trigger asynchronous ledger entry posting, fraud detection rule evaluations, and notification dispatching.

4. **Real-time Fraud & Immutable Audit Logging**:
   - Asynchronous rule engine evaluating transactions for high-risk flags (e.g., high-velocity deposits, extreme amounts).
   - Stores immutable system event logs and severity-badged alert records (`HIGH`, `MEDIUM`, `LOW`).

5. **Security & Authentication**:
   - Passwords hashed with **Argon2id**.
   - Short-lived JWT Access Tokens with Refresh Tokens stored/blacklisted in Redis.
   - API Gateway rate-limiting (`express-rate-limit` + Redis store) and correlation ID propagation.

6. **Executive Dashboard**:
   - Glassmorphism dark-mode interface built with Next.js App Router, custom HSL design tokens, micro-animations, and live transaction feeds.

---

## 🗂 Workspace & Services Structure

|---|---|---|---|
| [`web`](file:///home/relego/Documents/PROJECTS/Fintech/vaultline/web) | **Web Dashboard** | Next.js 14/16, React, CSS Modules | Executive user portal (Auth, Ledger history, Deposit/Transfer forms, Fraud alerts, Audit logs) |
| [`gateway`](file:///home/relego/Documents/PROJECTS/Fintech/vaultline/gateway) | **API Gateway** | Express.js, TypeScript | Central routing, CORS, JWT verification middleware, rate-limiting, proxying |
| [`services/auth-service`](file:///home/relego/Documents/PROJECTS/Fintech/vaultline/services/auth-service) | **Auth Service** | Express.js, PostgreSQL, Redis | User registration, Argon2 verification, JWT issuance, refresh token revocation |
| [`services/ledger-service`](file:///home/relego/Documents/PROJECTS/Fintech/vaultline/services/ledger-service) | **Ledger Service** | NestJS, PostgreSQL | Double-entry journal & ledger engine, serializable accounting transactions, balance tracking |
| [`services/payments-service`](file:///home/relego/Documents/PROJECTS/Fintech/vaultline/services/payments-service) | **Payments Service** | NestJS, Redis, RabbitMQ | Payment orchestration, external gateway provider stub, idempotency lock manager |
| [`services/fraud-audit-service`](file:///home/relego/Documents/PROJECTS/Fintech/vaultline/services/fraud-audit-service) | **Fraud & Audit** | Express.js, PostgreSQL | RabbitMQ consumer, rule evaluation engine, fraud alert stream, immutable system audit logs |
| [`services/notification-service`](file:///home/relego/Documents/PROJECTS/Fintech/vaultline/services/notification-service) | **Notification** | NestJS, RabbitMQ | Event consumer sending real-time user transaction alerts and receipt emails |

---

## 🛠 Tech Stack

- **Frontend**: Next.js 14/16 (App Router), React 19, TypeScript, Vanilla CSS (HSL design tokens & Glassmorphism), Recharts
- **Backend Frameworks**: NestJS, Express.js
- **Languages**: TypeScript, Node.js (v20+)
- **Databases**: PostgreSQL 16 (isolated microservice DB schemas)
- **Cache & Locks**: Redis 7
- **Message Broker**: RabbitMQ 3.x (AMQP)
- **Containerization**: Docker, Docker Compose
- **Cryptography**: Argon2id, JSON Web Tokens (JWT)

---

## ⚡ Quick Start & Setup

### 🐳 Option A: Production Standard (Full Docker Containerization)

Run the **entire stack** (Databases, Redis, RabbitMQ, 5 Microservices, API Gateway, and Web Dashboard) with a single command:

```bash
docker compose up --build -d
```

Once running, run database migrations inside the containers:
```bash
npm run migrate:all
```

The application is now fully running:
- **Web Dashboard**: `http://localhost:3000`
- **API Gateway**: `http://localhost:8000`
- **RabbitMQ Management**: `http://localhost:15672` (`vaultline_mq` / `mq_secret_pass`)
- **Prometheus**: `http://localhost:9090`
- **Grafana**: `http://localhost:3001` (`admin` / `admin`)

Account numbers are generated by the Ledger Service in `VL` plus 10-digit
format. The browser does not generate or accept account numbers.

### 💻 Option B: Local Development Mode (Hybrid Hot-Reloading)

For rapid local code iteration with instant TypeScript hot-reloading:

1. **Start Infrastructure in Docker**:
   ```bash
   npm run infra:up
   ```
2. **Run Migrations**:
   ```bash
   npm run migrate:all
   ```
3. **Launch All Services & Web Dashboard Concurrently**:
   ```bash
   npm run dev:all
   ```

Open `http://localhost:3000` to access the Vaultline Dashboard!

---

## 📜 Monorepo NPM Commands

| Command | Description |
|---|---|
| `npm run setup` | Installs dependencies, launches Docker infra (`postgres`, `redis`, `rabbitmq`) |
| `npm run dev:all` | Runs all microservices, API Gateway, and Next.js Web Dashboard concurrently |
| `npm run dev:web` | Starts only the Next.js frontend workspace |
| `npm run build:all` | Builds TypeScript across all microservices and the Next.js production bundle |
| `npm run migrate:all` | Compiles and executes migrations for Auth, Ledger, and Fraud databases |
| `npm run infra:up` | Starts Docker Compose background infrastructure (`docker compose up -d`) |
| `npm run infra:down` | Stops Docker Compose infrastructure |
| `npm run infra:reset` | Tears down volumes and recreates clean database/redis instances |
| `npm run test:all` | Executes test suites across all workspaces |

---

## 📊 Observability

The Docker stack includes Prometheus, Grafana, RabbitMQ metrics, PostgreSQL
metrics, and Redis metrics. Every backend service exposes `/metrics`, and
services expose health endpoints for liveness/readiness checks.

Open the pre-provisioned **Vaultline Overview** dashboard at:

```text
http://localhost:3001
Username: admin
Password: admin
```

Check Prometheus scrape status at `http://localhost:9090/targets`.

Useful checks:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/metrics
docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers
docker compose ps
```

The RabbitMQ Management console uses the credentials from `.env`:

```text
Username: vaultline_mq
Password: mq_secret_pass
```

---

## 🌐 API Gateway Endpoints (`http://localhost:8000`)

All client requests flow through the API Gateway:

### Auth Routes (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Register a new user
- `POST /api/v1/auth/login` — Authenticate and receive Access & Refresh JWTs
- `POST /api/v1/auth/logout` — Revoke and blacklist refresh token in Redis

### Ledger Routes (`/api/v1/ledger`) *(JWT Protected)*
- `POST /api/v1/ledger/accounts` — Create ledger account (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`)
- `GET /api/v1/ledger/accounts` — List accounts owned by the authenticated user
- `GET /api/v1/ledger/accounts/:id/balance` — Fetch account balance & metadata
- `GET /api/v1/ledger/accounts/:id/history` — Fetch double-entry transaction ledger entries
- `POST /api/v1/ledger/entries` — Post raw double-entry journal entry

### Payments Routes (`/api/v1/payments`) *(JWT Protected + Idempotent)*
- `POST /api/v1/payments/deposit` — Process external deposit (Requires `X-Idempotency-Key` header)
- `POST /api/v1/payments/transfer` — Peer-to-peer account transfer (Requires `X-Idempotency-Key` header)

### Fraud & Audit Routes (`/api/v1/fraud`) *(JWT Protected)*
- `GET /api/v1/fraud/fraud-alerts` — List detected fraud alerts & severity ratings
- `GET /api/v1/fraud/audit-logs` — Query immutable system audit log stream

---

## 🔒 Security & Reliability Architecture

- **PostgreSQL Isolation**: Accounting entries use `BEGIN ISOLATION LEVEL SERIALIZABLE` to prevent phantom reads, write skew, or race conditions during concurrent payments.
- **Idempotency Locking**: Payments utilize Redis `SET key value NX PX 10000` locks to prevent double-spending or duplicate charges.
- **Token Blacklisting**: Revoked tokens are saved in Redis with TTL equal to the remaining JWT duration.
- **Microservice Autonomy**: Each service owns its database instance/schema, communicating asynchronously via RabbitMQ AMQP messaging.

### Event-Driven Verification

Payments publishes `payment.completed` or `payment.failed` to the durable
`vaultline_events` topic exchange. Ledger, Fraud/Audit, and Notification each
consume the event independently.

To verify the flow, log in, create or select a wallet account, submit a deposit,
then check the wallet balance, Ledger history, Audit Log, and service logs.

```bash
docker compose logs --since=5m payments-service ledger-service fraud-audit-service notification-service
docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers
```

Queues should return to zero pending messages after successful processing.

---

## 📝 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
