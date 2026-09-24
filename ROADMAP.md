# Vaultline — Future Roadmap & TODOs

> Stuff to come back to. Not today.

---

## 🚨 Critical Gaps (Fix before calling this production-ready)

- [ ] **Write actual tests** — `npm run test:all` exists but there are no test files. Start with:
  - Unit tests on the ledger double-entry invariant (DEBIT == CREDIT)
  - Integration test on the idempotency lock flow
  - E2E test: deposit → RabbitMQ event → ledger entry posted
- [ ] **Dead letter queues (DLQ)** — if a RabbitMQ consumer crashes mid-processing, the `payment.completed` message is gone and money gets credited nowhere. Add DLQs + retry logic to all consumers (Ledger, Fraud, Notifications)
- [ ] **M-Pesa STK Push status polling** — Daraja has a `stkpushquery` endpoint. If the callback never arrives (Safaricom hiccup, network issue), a payment stays `PENDING` in Redis forever with no resolution. Implement a polling/expiry job to catch these
- [ ] **B2C Security Credential setup guide** — `MPESA_SECURITY_CREDENTIAL` in `.env` is a placeholder. In production it must be the initiator password encrypted with Safaricom's public certificate. Document this step properly or it'll silently break all withdrawals

---

## 🛠 Features (Make it a real product)

- [ ] **M-Pesa deposit UI on the dashboard** — `web/src/app/payments/page.tsx` only knows about card deposits. Build the STK Push flow: phone number input → `PENDING` state → poll or WebSocket for confirmation → success/failure feedback
- [ ] **M-Pesa withdrawal UI** — no way for a user to withdraw to their M-Pesa from the dashboard at all right now
- [ ] **Account statements** — export transaction history as PDF or CSV. The data is already in the ledger, just needs a route + template
- [ ] **Admin panel** — operator view to see all users, manually flag/unflag transactions, override fraud alerts, without touching the database directly
- [ ] **Scheduled / recurring payments** — "pay every month" is table stakes for a banking product
- [ ] **Real Stripe integration** — `PaymentProviderService` is still a fake stub (`tx_stripe_${Date.now()}`). Replace with actual Stripe Charges or Payment Intents API

---

## 🔐 Security Upgrades

- [ ] **MFA / 2FA** — add TOTP support (Google Authenticator / Authy style). Currently just password + JWT
- [ ] **Per-user rate limiting** — current rate limiting is per-IP only. A logged-in user with a dynamic IP can hammer payment endpoints. Key rate limits by `userId` extracted from the JWT
- [ ] **Input sanitization audit** — DTOs use `class-validator` (good) but do a pass to confirm no raw SQL strings sneak through anywhere in the ledger service

---

## 📊 Observability

- [ ] **Distributed tracing** — add OpenTelemetry + Jaeger or Tempo. Correlation IDs are already propagated but there's no way to visualize a full request trace across all 5 services. Currently you're digging through 5 separate log streams when something breaks across service boundaries
- [ ] **Grafana alert rules** — dashboards exist but no alert thresholds. Add alerts like: "payment failure rate > 5% for 2 minutes", "RabbitMQ queue depth > 100", "auth service 5xx spike"
- [ ] **Swagger / OpenAPI docs** — auto-generate API docs from the NestJS decorators and Express routes. Anyone integrating currently has to read the source code

---

## 🌍 Product Expansion

- [ ] **Airtel Money integration** — M-Pesa has ~70% of Kenya's mobile money market, Airtel has most of the rest. The provider pattern in payments-service is already designed for multiple providers — a second mobile money integration is a natural fit
- [ ] **Multi-currency properly** — `currency` is a DTO field but there's no exchange rate engine, no conversion logic, and the ledger doesn't enforce currency consistency within an account. Needs a proper design before expanding beyond KES/USD
- [ ] **KYC (Know Your Customer)** — real fintech requires identity verification before moving money above regulatory limits. Even a basic "upload your ID → pending review → verified" status flag would make this feel like a real product
- [ ] **Outbound webhooks** — Vaultline receives webhooks (from M-Pesa) but doesn't send them. Needed if you ever want to let merchants use Vaultline as a payment method

---

## 🏗 Architecture

- [ ] **Persistent storage for payments-service** — Payments only has Redis. There's no durable record of payment attempts. If Redis goes down while a callback is in-flight, the pending context is lost. Add a lightweight Postgres table to record payment attempts
- [ ] **CI/CD pipelines** — `.github/` directory exists but no actual workflow files. Add: lint → test → build → Docker image push on PRs and merges
- [ ] **Fix the broken comment in `gateway/src/index.ts`** — line 52, the newline between the Route 1 comment and `app.use(` was accidentally deleted
- [ ] **Remove stray "what" from bottom of README.md** — line 273

---

## Priority Order (when you come back to this)

1. Tests + DLQs — these are the ones that would lose real money if missing
2. M-Pesa UI (STK Push flow + withdrawal) — biggest visible gap
3. Distributed tracing — saves hours of debugging pain
4. Admin panel — needed before any real users
5. Everything else



irst — two quick things you accidentally left in your files:

what typed at the end of 

README.md
 line 273
A broken comment in 

gateway/src/index.ts
 line 52 — the newline between the comment and app.use( got deleted
Worth cleaning those up whenever.

What Vaultline actually is
At its core, Vaultline is a neobank / digital wallet platform — think M-Pesa, Chipper Cash, or Revolut but built from scratch as a learning/portfolio/production-grade system. A user can:

Create an account and authenticate
Open a wallet (ledger account)
Deposit money — via card token or M-Pesa STK Push on their phone
Transfer money to another Vaultline wallet
Withdraw back to their M-Pesa
View their full transaction history, balance, and any fraud flags against their account
Everything underneath that simple surface is the interesting part — the double-entry accounting engine, the idempotency system, the event pipeline, the fraud rules. The project is essentially proving that you can build a financially correct, production-resilient payments system on Node.js without cutting corners.

What's missing / what could be upgraded
Here's an honest breakdown by area:

🚨 Critical gaps (things that would block real usage)
No tests exist — npm run test:all is defined but there are almost certainly no actual test files. For a fintech system this is a serious gap. Unit tests on the ledger invariant, integration tests on the idempotency flow, and E2E tests on the payment → RabbitMQ → ledger chain would all be high value.
Dead letter queues — if a RabbitMQ consumer crashes while processing payment.completed, the message is gone. There's no DLQ (dead letter queue) or retry mechanism. Real money could get credited nowhere.
No M-Pesa STK Push query — Daraja has a stkpushquery endpoint to check the status of a pending payment. If the callback never arrives (network issue, Safaricom hiccup), you have a PENDING payment stuck in Redis with no resolution path.
B2C Security Credential — the MPESA_SECURITY_CREDENTIAL in .env is just a placeholder. In production this needs to be your Daraja initiator password encrypted with Safaricom's public certificate — it's a non-trivial setup step that'll trip people up.
🛠 Features that make it a real product
The web dashboard probably doesn't have M-Pesa forms yet — the payments page in web/src/app/payments/page.tsx almost certainly only knows about card deposits. The whole STK Push → PENDING → async confirmation UX needs to be built (polling or WebSocket for status updates).
Withdrawal UI — no way for a user to withdraw to M-Pesa from the dashboard.
Account statements — users expect to be able to export their transaction history as PDF or CSV. The data is already in the ledger, just needs a route and a template.
Admin panel — there's no operator view. No way to see all users, manually flag a transaction, or override a fraud alert without hitting the database directly.
Scheduled / recurring payments — "pay every month" is table stakes for a banking app.
🔐 Security that's missing
No MFA / 2FA — just username + password. TOTP (Google Authenticator style) would be a meaningful upgrade.
Rate limiting is per-IP only — a logged-in user with dynamic IP could hammer the payments endpoint. Per-user rate limiting (keyed by userId from the JWT) would be more correct.
No input sanitization audit — the DTOs use class-validator which is good, but there's no systematic check that SQL injection via raw queries isn't possible anywhere in the ledger service.
📊 Observability gaps
No distributed tracing — correlation IDs are propagated through the gateway but there's no OpenTelemetry / Jaeger setup to visualize the full trace of a request across all 5 services. When something goes wrong across service boundaries, you're currently digging through 5 separate log streams.
No alerting rules in Grafana — the dashboards exist but there are no alert thresholds configured (e.g. "alert me if payment failure rate > 5% for 2 minutes").
No Swagger / OpenAPI docs — the API has no self-documenting interface. Anyone integrating has to read the source or the README.
🌍 Business/product expansion
Multi-currency is half-done — currency is a field on DTOs but there's no exchange rate engine, no conversion logic, and the ledger doesn't enforce currency consistency within an account.
Airtel Money — M-Pesa has ~70% of the Kenyan mobile money market. Airtel Money has most of the rest. The provider pattern in payments-service is already set up for multiple providers — a second mobile money integration is a natural next step.
KYC (Know Your Customer) — real fintech requires identity verification before you can move money above certain limits. Even a basic "upload your ID" flow with a status flag would make this feel like a real product.
Webhook delivery to external systems — Vaultline consumes webhooks (from M-Pesa) but doesn't send them. If you wanted to let merchants integrate Vaultline as a payment method, you'd need outbound webhooks when payments complete.
🏗 Architecture improvements
The PaymentProviderService is still a stub — the original card deposit flow is just a fake tx_stripe_${Date.now()}. If you want this to be real end-to-end, that needs a real Stripe integration or at least a proper mock.
No database for payments-service — Payments has Redis for idempotency but no persistent database. There's no durable record of payment attempts beyond what's in the ledger. If Redis goes down and a callback arrives, the pending context is gone.
CI/CD — there's a .github directory but no actual workflows. Automated testing and deployment pipelines would make this feel complete.
The biggest bang-for-buck upgrades in order would probably be: tests, DLQs in RabbitMQ, M-Pesa status polling + dashboard UI for it, and distributed tracing. Those four would take this from "impressive demo" to "I'd actually trust this with money."
