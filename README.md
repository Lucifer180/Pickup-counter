
# 🍫 Self-Service Snack Counter

A full-stack self-service snack counter where customers select snacks, simulate UPI payments, and collect their orders from a locker.

Built with **TypeScript, Node.js, Express, PostgreSQL, React, and Vite**, this project focuses on database concurrency, stock consistency, payment webhook idempotency, and reliable order pickup.

## ✨ Features

- **Real-time stock availability** — prevents overselling when multiple customers order simultaneously.
- **Transactional order creation** — locks product rows and validates stock before creating orders.
- **Simulated UPI payments** — supports payment capture through a signed webhook.
- **Webhook idempotency** — duplicate payment events are processed only once.
- **Late-payment handling** — moves orders to review when payment succeeds but stock is no longer available.
- **One-time locker pickup** — prevents multiple pickup claims and duplicate stock deductions.
- **Expiry management** — pending orders expire after 120 seconds.
- **Clock-independent countdown** — uses the server's database time and a monotonic browser timer.
- **Integration testing** — tests concurrency using a real PostgreSQL database.
- **Docker support** — run the application with a single command.
- **CI/CD** — GitHub Actions validates types, tests, production builds, and Docker images.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| TypeScript | Type-safe development |
| Node.js | Backend runtime |
| Express | REST API |
| PostgreSQL | Relational database |
| Neon | Hosted PostgreSQL |
| React | Customer interface |
| Vite | Frontend development and build tooling |
| Vitest | Automated testing |
| Docker | Containerization |
| GitHub Actions | Continuous integration |

## 🏗️ Architecture

```text
React + Vite Frontend
        |
        v
   Express REST API
        |
        v
Routes → Controllers → Services → Repositories
        |
        v
   PostgreSQL Database
        |
        ├── Products and stock
        ├── Orders and order items
        └── Payment events

Payment Simulator
        |
        v
Signed Payment Webhook
        |
        v
Idempotent Payment Processing
```

## 🚀 Getting Started

### Prerequisites

- Node.js and npm
- Docker and Docker Compose (recommended)
- PostgreSQL, or a Neon PostgreSQL database

### Option 1: Run with Docker

Clone the repository:

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_PROJECT_DIRECTORY>
```

Start the application:

```bash
docker compose up --build
```

Open the application:

- **Customer interface / API:** http://localhost:4000
- **Health check:** http://localhost:4000/health

Database migrations and seed data run automatically during startup.

The bundled PostgreSQL container allows you to run the project without configuring an external database.

### Option 2: Run Locally

Create your environment file:

```bash
cp .env.example .env
```

Configure the required environment variables in `.env`, including your database connection string and webhook secret.

Install dependencies:

```bash
npm install
```

Run migrations and seed the database:

```bash
npm run db:migrate
npm run db:seed
```

Start the development servers:

```bash
npm run dev
```

The backend runs on port `4000`, and the Vite frontend runs at:

http://localhost:5173

## 🔐 Environment Variables

Configure the following values according to your `.env.example` file.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_URL_UNPOOLED` | Optional direct database connection for migrations |
| `WEBHOOK_SECRET` | Secret used to verify payment webhook signatures |
| `TEST_DATABASE_URL` | Disposable PostgreSQL database for integration tests |
| `ENABLE_PAYMENT_SIMULATOR` | Enables demo payment simulation when set to `true` |

Example Neon connection string:

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST/neondb?sslmode=require
WEBHOOK_SECRET=your-local-webhook-secret
ENABLE_PAYMENT_SIMULATOR=true
```

**Security:** Never commit `.env` files, database credentials, or production webhook secrets to GitHub.

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/products` | Retrieve products and available stock |
| `POST` | `/orders` | Create an order |
| `GET` | `/orders/:id` | Retrieve order status and expiry countdown |
| `POST` | `/payments/webhook` | Process signed payment events |
| `POST` | `/payments/simulate` | Simulate payment capture for demos |
| `POST` | `/orders/:id/pickup-claim` | Claim an order for locker pickup |
| `GET` | `/health` | Check database connectivity |

### Create an Order

`POST /orders`

Request body:

```json
{
  "items": [
    {
      "productId": "PRODUCT_UUID",
      "quantity": 2
    }
  ]
}
```

The endpoint validates availability and creates the order within a database transaction.

A successful request returns `201 Created`. Insufficient stock returns `409 Conflict` with the error code `INSUFFICIENT_STOCK`.

### Payment Webhook

`POST /payments/webhook`

Example payload:

```json
{
  "eventId": "evt_123",
  "orderId": "ORDER_UUID",
  "amountPaise": 4500,
  "status": "captured"
}
```

The webhook uses an `X-Signature` header containing the hexadecimal HMAC-SHA256 signature of the raw request body.

- Invalid signatures return `401 Unauthorized`.
- Malformed payloads return `400 Bad Request`.
- Duplicate event IDs are handled idempotently.
- Amount mismatches move orders to `needs_review`.

### Order Status Lifecycle

```text
pending ──────────> paid ──────────> picked_up
    |
    ├─────────────> expired
    |
    └─────────────> needs_review
```

## 🧠 Concurrency and Data Consistency

### Preventing Overselling

Order creation runs in a database transaction and locks the relevant product rows using `SELECT ... FOR UPDATE`.

1. Product rows are locked in a consistent ID order.
2. Current availability is calculated after acquiring the locks.
3. If any requested item is unavailable, the entire transaction rolls back.
4. Otherwise, the order and its items are inserted atomically.

A database constraint also prevents negative stock values.

### Stock Reservation Model

Physical stock is reduced only when an order is picked up.

```text
Available stock =
Physical stock
- Active pending reservations
- Paid orders awaiting pickup
```

Pending reservations expire after 120 seconds. Availability is calculated from order status and expiry time, so it remains correct even if the background expiry job is delayed.

### Payment Idempotency

Payment event IDs are stored with a unique database constraint. The event record and order update occur within the same transaction, preventing duplicate deliveries from processing the same event multiple times.

### Late Payments

If payment succeeds after an order expires:

- If the required stock is still available, the order can become `paid`.
- If another customer has taken the stock, the order moves to `needs_review`.
- The system does not oversell or take stock from another customer's order.

Automatic refunds are not implemented; orders requiring refunds need manual resolution.

### One-Time Pickup

Pickup claims are transactionally protected. Concurrent claims cannot collect the same order twice, and physical stock is decremented only once.

## 🧪 Testing

The integration tests use a real PostgreSQL database and concurrent HTTP requests.

Configure `TEST_DATABASE_URL` to point to a **disposable test database** before running the tests. The test suite truncates database tables.

Run the tests:

```bash
TEST_DATABASE_URL="postgres://..." npm test
```

Or use the local PostgreSQL container:

```bash
docker compose up -d db
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/pickup" npm test
```

### Test Coverage

| Test suite | Coverage |
|---|---|
| `concurrent-orders.test.ts` | Simultaneous orders, stock limits, atomic rollback, and expired reservations |
| `webhook-idempotency.test.ts` | Duplicate webhooks, signature verification, amount mismatches, and late payments |
| `concurrent-pickup.test.ts` | Simultaneous pickup claims, one-time collection, and stock deduction |

The tests also validate important failure scenarios by deliberately removing locking protections and confirming that the concurrency tests fail.

## 🐳 Docker

Build and start the application:

```bash
docker compose up --build
```

Stop the containers:

```bash
docker compose down
```

## ☁️ Neon PostgreSQL

To use Neon:

1. Create a project in the [Neon Console](https://console.neon.tech).
2. Copy the database connection string into `DATABASE_URL`.
3. Create a separate Neon branch for integration testing.
4. Configure `TEST_DATABASE_URL` with the test branch connection string.
5. Optionally configure `DATABASE_URL_UNPOOLED` for migrations.

Use a separate test database because integration tests clear their tables.

## 🌐 Deployment

| Part | Host | URL |
|---|---|---|
| Frontend | GitHub Pages | https://lucifer180.github.io/Pickup-counter/ |
| API | Render (Node web service) | https://pickup-counter-qtpl.onrender.com |

### Frontend (GitHub Pages)

`.github/workflows/pages.yml` builds and deploys the frontend on every push to `main`. It sets:

- `VITE_BASE=/Pickup-counter/` — the repository sub-path GitHub Pages serves from.
- `VITE_API_URL=https://pickup-counter-qtpl.onrender.com` — the API the browser calls.

`index.html` is copied to `404.html` so client-side routes work on page refresh.

### API (Render)

| Setting | Value |
|---|---|
| Build command | `npm ci --include=dev && npm run build:api` |
| Start command | `node dist/api/migrate.js && node dist/api/seed.js && node dist/api/server.js` |
| Environment | `DATABASE_URL`, `WEBHOOK_SECRET`, `ENABLE_PAYMENT_SIMULATOR` |

Render auto-deploys on commits to `main`. If the live commit falls behind, use **Manual Deploy → Deploy latest commit**. Free instances sleep when idle, so the first request after a pause can take 30–60 seconds.

### CORS

The API allows requests from **any origin** (`Access-Control-Allow-Origin: *`), so the GitHub Pages frontend, `localhost`, or any other host can call it. No CORS configuration is needed.

## ⚙️ Continuous Integration

The GitHub Actions workflow in `.github/workflows/ci.yml` runs:

- Type checking
- Integration tests against PostgreSQL 16
- Production frontend/backend build
- Docker image build

An optional Neon workflow can create temporary database branches for pull requests and apply migrations to the main Neon branch. It requires the relevant Neon credentials and configuration.

## 📁 Project Structure

```text
apps/
├── api/
│   └── src/
│       ├── config/
│       ├── middleware/
│       ├── modules/
│       │   ├── products/
│       │   ├── orders/
│       │   ├── payments/
│       │   └── pickups/
│       ├── jobs/
│       └── db/
└── web/
    └── src/

scripts/
└── send-webhook.ts

tests/
├── integration/
└── helpers/
```

The backend follows a modular architecture:

- **Routes:** Define HTTP endpoints.
- **Controllers:** Handle HTTP requests and responses.
- **Services:** Implement business rules.
- **Repositories:** Execute database queries.
- **Jobs:** Perform background order-expiry maintenance.

## 💳 Simulating Payments

Capture the exact order total:

```bash
npm run send-webhook -- --order <orderId>
```

Send the same event three times:

```bash
npm run send-webhook -- --order <orderId> --event evt_1 --repeat 3
```

Test an incorrect payment amount:

```bash
npm run send-webhook -- --order <orderId> --amount 100
```

Test an invalid signature:

```bash
npm run send-webhook -- --order <orderId> --bad-signature
```

These commands help verify webhook security, idempotency, and payment reconciliation.

## 🔭 Future Improvements

- Staff dashboard for reviewing exceptional payment cases
- Automated payment refunds and reliable refund processing
- Locker authentication and API rate limiting
- Idempotency keys for order creation
- Server-Sent Events for live order updates
- Structured logging and application metrics
- Load testing and property-based concurrency tests
- Automated browser tests for countdown behavior

## ⚠️ Current Limitations

- UPI payment processing is simulated; the QR code is a placeholder.
- Customer and locker authentication are not implemented.
- CORS is open to all origins, so any website can call the API from a browser.
- Refunds and staff review workflows are not automated.
- The customer interface polls the API rather than using push updates.

## 📄 License

Add a license file and specify the license here if you intend to distribute or reuse this project publicly.
