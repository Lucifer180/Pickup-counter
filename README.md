

A self-service snack counter: customers pick items, pay by UPI (simulated webhook), and collect from a locker.
The focus is on staying correct when things happen at the same time or arrive late: stock is never oversold, webhooks are safe to repeat, and only one locker can claim an order.

**Stack:** TypeScript · Node.js + Express · PostgreSQL ([Neon](https://neon.tech)) · React + Vite · Vitest · Docker · GitHub Actions

---

```bash
docker compose up --build
```

Open **http://localhost:4000**. The API and the customer screen are served from the same container. Migrations and seed data run automatically on start.

With no `.env`, this uses the bundled Postgres container, so it works with zero setup. To run against **Neon** instead, create `.env` with your Neon connection string and run the same command:

```bash
DATABASE_URL=postgres://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

```bash
cp .env.example .env        # fill in DATABASE_URL (Neon) and WEBHOOK_SECRET
npm install
npm run db:migrate
npm run db:seed
npm run dev                 # API on :4000, customer screen on http://localhost:5173
```

```bash
npm run send-webhook -- --order <orderId>                        # capture for the exact total → paid
npm run send-webhook -- --order <orderId> --event evt_1 --repeat 3  # same event 3×, processed once
npm run send-webhook -- --order <orderId> --amount 100           # wrong amount → needs_review
npm run send-webhook -- --order <orderId> --bad-signature         # → 401
```

Inside Docker: `docker compose exec api node dist/api/send-webhook.js --order <orderId>`.
The customer screen also has **Demo tools** buttons (simulate payment, wrong amount, locker pickup) so the whole flow can be clicked through.

---

The tests run against a **real PostgreSQL database**, not mocks. They start the real Express app on a random port and fire genuinely concurrent HTTP requests, so each request gets its own DB connection.

```bash

TEST_DATABASE_URL=postgres://...neon.tech/neondb?sslmode=require npm test

docker compose up -d db
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pickup npm test
```

> ⚠️ Tests `TRUNCATE` all tables. Point `TEST_DATABASE_URL` at a throwaway branch or database.

| File | What it proves |
|---|---|
| `tests/integration/concurrent-orders.test.ts` | **10 customers order the last 2 units at once → exactly 2 held, 8 get 409.** Also: a 20-way race with mixed quantities never holds more than the stock; a partially unavailable order holds nothing; totals are integer paise; expired holds free units immediately (even with the expiry job off). |
| `tests/integration/webhook-idempotency.test.ts` | **The same event sent twice → processed once** (and 10 concurrent copies → one processed, nine marked duplicate). Bad, missing and tampered signatures → 401 with no changes. Amount mismatch → `needs_review`. Both late-payment paths. |
| `tests/integration/concurrent-pickup.test.ts` | **Two simultaneous pickup claims → exactly one 200, one 409**, and stock goes down once (also with 10 claims). Unpaid, expired and `needs_review` orders cannot be claimed. |

A concurrency test that passes is only useful if it would fail on broken code. So I broke the code on purpose and re-ran the tests:

* **Removed the product row lock in `createOrder`** → the 10-customer test failed: *6* orders held the last 2 units, and the 20-way test held 19 of 7.
* **Changed the pickup claim to also match `picked_up` orders** → both pickup race tests failed with two successes.

Both changes were reverted. I also ran the built app end to end (curl + `send-webhook`). Then I opened the customer screen in a headless browser with the device clock set **7 minutes fast** (and in a second run, 5 minutes slow): the countdown still started at 1:59 and ticked down correctly, and the expired, paid and collected screens all appeared.

CI (`.github/workflows/ci.yml`) runs the typecheck, the full test suite against a Postgres 16 service container, the production build and a Docker image build on every push and PR.

---

| Method | Path | Notes |
|---|---|---|
| `GET` | `/products` | `[{ id, name, pricePaise, stock, availableUnits }]` |
| `POST` | `/orders` | Body: `[{ productId, quantity }]` (or `{ items: [...] }`). `201` with `{ id, status, totalPaise, items, expiresInSeconds, ... }`. `409 INSUFFICIENT_STOCK` lists each short product with how many are left. |
| `GET` | `/orders/:id` | Current status plus `expiresInSeconds`. The customer screen polls this. |
| `POST` | `/payments/webhook` | Raw JSON `{ eventId, orderId, amountPaise, status }`, with header `X-Signature: hex(HMAC-SHA256(rawBody, WEBHOOK_SECRET))`. |
| `POST` | `/orders/:id/pickup-claim` | Called by the locker. `200` once; then `409 ALREADY_CLAIMED`. `409 NOT_PAID / ORDER_EXPIRED / ORDER_IN_REVIEW` otherwise. |
| `POST` | `/payments/simulate` | Demo only (`ENABLE_PAYMENT_SIMULATOR=true`): runs a capture through the same webhook code path. |
| `GET` | `/health` | Checks the DB connection. |

Errors always look like `{ "error": { "code", "message", "details?", "requestId" } }`.

Order statuses: `pending → paid → picked_up`, or `pending → expired`, or `→ needs_review`.

---

`products.stock` is the number of units physically in the counter, and **only a pickup reduces it**. "Held" units are not stored in a counter. They are calculated from live orders:

```
available = stock − Σ quantity of orders that are (pending AND expires_at > now) OR paid
```

So **a hold expires exactly when its time runs out**, even if the background job is down or late. Nothing has to "give units back", so nothing can forget to. The expiry job (`jobs/expire-orders.job.ts`) only flips the stored status to `expired` for tidy data. The API already reports a pending order whose time has run out as `expired`.

`POST /orders` runs in one transaction:

1. `SELECT … FROM products WHERE id = ANY(…) ORDER BY id FOR UPDATE`: lock the products being ordered, always in id order so two multi-item orders can't deadlock.
2. Calculate availability, which takes a fresh snapshot after getting the lock (Postgres `READ COMMITTED`), so it sees every hold committed before us.
3. If any line is short → roll back (nothing held) and return `409` naming the products and units left. Otherwise insert the order and its items.

Orders for *different* products don't block each other. The webhook and pickup paths take the same product locks (order row first, then products) before changing what is held. `CHECK (stock >= 0)` is a last line of defence at the database level.

Time checks use `clock_timestamp()`, not `now()`. In Postgres, `now()` is frozen at the start of a transaction, which would be stale after waiting on a lock. Every expiry decision is made on the **database clock**, so app servers with drifting clocks can't disagree.

* The signature is checked against the **raw request bytes** (`express.raw` on that one route), using `timingSafeEqual`. Re-serialising the parsed JSON could change key order or whitespace.
* Idempotency comes from `payment_events.event_id` as the primary key: `INSERT … ON CONFLICT DO NOTHING` is the first statement in the transaction. If two copies arrive at once, the second waits for the first to commit, inserts nothing, and returns `{ duplicate: true }` with the original outcome. The event record and the order update commit together, so a crash part-way means the provider's retry starts cleanly.
* A correctly signed event always gets `200`, even when it is ignored, so the provider stops retrying. Only bad signatures (`401`) and malformed bodies (`400`) are rejected.
* Only `status: "captured"` changes an order. Other statuses (e.g. `failed`) are recorded and ignored: the hold simply runs out and the customer can try again.
* `amountPaise ≠ total` → `needs_review` with a reason like `expected 4500 paise, received 4400 paise`.
* A *different* event capturing an order that is already paid is recorded as `ignored_already_paid`. It is probably a double charge, and that record is the refund trail.

A valid capture arrives after the 120-second hold has expired. **What I chose:**

> **If the units are still free right now, accept the payment and mark the order `paid`. If anyone else has taken them meanwhile, mark the order `needs_review` with reason `late_payment_stock_gone … refund required`, and never take units from another customer.**

Why:

* **The customer has already paid.** Auto-rejecting a successful payment leads to a refund, a support ticket and an unhappy customer. The common case is that someone paid at 2:05 for a snack nobody else wanted, and the right outcome is that they get their snack.
* **Stock correctness comes first.** The check runs under the same product locks as order creation, so a late payment can never oversell or take over another customer's live hold. That would be the worst outcome: two paid customers and one brownie.
* **Some cases need a person.** When the units are gone, money has moved but no goods can be handed over. That needs a refund, which this system can't do on its own (there's no provider refund API), so the order goes to `needs_review` for staff, with the reason stored.
* Real UPI providers can deliver captures late (retries, bank delays), so this is expected traffic, not a rare edge case.

Alternatives I considered: *always refund late payments* (simpler, but punishes customers for a few seconds' delay) and *extend holds once payment is initiated* (better, but needs a "payment started" event the brief doesn't have; see Next steps).

A `needs_review` order doesn't hold units. Otherwise a mismatched payment could lock stock forever while waiting for a human. When staff resolve it they either refund or hand over items manually. A staff resolution flow is out of scope (see Next steps).

Payment doesn't reduce `stock`; a pickup does (as the brief asks). In between, a paid order keeps its units held with no time limit, because the customer owns them now.

The counter's clock can be minutes off, so the screen **never compares an absolute `expiresAt` with `Date.now()`**. The server sends `expiresInSeconds`, measured on the DB clock when the response is built. The client pins that to `performance.now()`, a monotonic timer that only measures elapsed time and ignores the wall clock (`hooks/useServerCountdown.ts`). The time when the request was *sent* is used as the anchor, so network delay makes the countdown run slightly short, never long. Every poll (every 2 s) re-syncs it, so a sleeping or throttled tab corrects itself. When it reaches 0:00 the screen says "checking…" and waits for the server to confirm `expired`. The server's answer is final.

---

* **Currency is INR**, stored as whole paise in `integer` columns (max ₹2.1 crore per order, far beyond a snack counter).
* `POST /orders` accepts a bare array (as in the brief) or `{ items: [...] }`. The same product listed twice is merged into one line. 1–20 lines, 1–20 units per line.
* `expiresInSeconds` is a whole number of seconds, rounded down (it never overstates the time left), and `0` once the order is no longer pending.
* The webhook `status` value for success is `"captured"`. Anything else is recorded and doesn't change the order.
* Webhook `eventId` is the provider's unique id for an event. A redelivery with the same id but a different body is still treated as a duplicate.
* There is no customer or locker authentication. Order ids are random UUIDs. Production would authenticate lockers (e.g. mTLS or a per-locker API key).
* The "Simulate" buttons and `/payments/simulate` are for the demo. They're off unless `ENABLE_PAYMENT_SIMULATOR=true`.
* The UPI QR on the payment screen is a placeholder.

---

1. Create a project at [console.neon.tech](https://console.neon.tech). Under **Connect**, copy the connection string (the `-pooler` host is fine for the app) into `DATABASE_URL`.
2. Create a second branch called `test` and put its connection string in `TEST_DATABASE_URL`.
3. Optional: set `DATABASE_URL_UNPOOLED` to the direct (non-pooler) string. Migrations prefer it because they use an advisory lock.

The pool listens for `error` events because Neon closes idle connections when the compute scales to zero. Without that listener the app would crash.

* **`ci.yml`**: typecheck, integration tests on a Postgres 16 service container, production build, Docker build. No secrets needed.
* **`neon.yml`**: on each PR, creates a Neon branch `preview/pr-<n>` and runs migrations and the full test suite **on Neon itself**, then deletes the branch when the PR closes. On a push to `main`, it applies migrations to the main Neon branch. To enable it, set `NEON_API_KEY` (secret), `NEON_PROJECT_ID` (variable) and `NEON_DATABASE_URL` (secret). Without them these jobs are skipped.

---

```
apps/api/src
  app.ts, server.ts            Express app (tests use createApp) and process entry (listen, job, shutdown)
  config/env.ts                validated environment (zod)
  middleware/                  request id + logging, zod validation, error envelope
  modules/<feature>/           routes → controller → service → repository
    products/                  availability query + product row locking
    orders/                    order creation (holds), read model with expiresInSeconds
    payments/                  signature, webhook idempotency, late-payment rules
    pickups/                   one-time claim + permanent stock decrement
  jobs/expire-orders.job.ts    status tidy-up (holds don't depend on it)
  db/                          pool, SQL migrations + runner, seed
apps/web/src                   React customer screen (pages, components, hooks, api client)
scripts/send-webhook.ts        signed webhook CLI
tests/integration, tests/helpers
```

Services hold the business rules. Repositories hold all SQL. Every multi-step change runs in one transaction (`withTransaction`).

---

* **Staff tools for `needs_review`**: list, refund, or "honour and hand over" actions, with an audit log.
* **Payment-initiated hold extension**: when the provider reports that a payment has started, extend the hold by ~60 s so slow UPI apps don't lead to late-payment refunds.
* **Outbox and provider refund API** so late or duplicate payments are refunded automatically, not just flagged.
* **Locker authentication** and a separate locker-facing API. Rate limiting on public endpoints.
* **Idempotency-Key on `POST /orders`** so a customer double-tapping on a flaky network doesn't place two holds.
* **Push instead of polling** (SSE) for the payment screen, with polling kept as a fallback.
* Structured logging (pino) and metrics: holds created, expired, late payments, and how long lock waits take.
* A load test (k6) that combines all the races at once, and property-based tests on the stock invariant.
* A Playwright test for the countdown with a skewed clock, run in CI. I ran this check by hand (see above) but haven't automated it.
 
 