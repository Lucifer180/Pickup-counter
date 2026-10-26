

> **Before submitting:** this note is meant to be in your own words. Read it, change anything that doesn't match how you actually worked, and fill in the last section yourself.

* **Claude (Anthropic), in the Claude desktop app's Cowork mode**: wrote nearly all of the code, the SQL schema, the tests, the GitHub workflows and a first draft of the README. It also ran the test suite against a local PostgreSQL 16 instance and drove a headless browser to check the customer screen.
* My part: I chose the stack and the folder structure (feature modules with routes → controller → service → repository), decided to use Neon for Postgres, gave it the brief, and reviewed the design decisions, especially the late-payment rule.

I pasted the complete assignment brief **together with the exact folder tree I wanted** (`apps/api/src/modules/{products,orders,payments,pickups}/…`, `tests/integration/{concurrent-orders,webhook-idempotency,concurrent-pickup}.test.ts`, etc.) and said "use Neon for the Postgres database, use this architecture, write GitHub workflows as well."

Giving it both the *requirements* and the *structure* worked much better than either alone. When it had only the folder tree, it guessed the requirements and guessed wrong (see below). With the brief alone, the structure would have been its choice, not mine.

1. **It built the wrong stock model from the folder names alone.** Before the brief was shared, it inferred requirements from file names and designed stock that was *decremented when an order was placed*, Stripe-style timestamped signatures, and pickup codes. The brief actually says `available = stock − units held by unpaid orders`, stock only goes down **at pickup**, and the signature is a plain hex HMAC of the raw body. This was caught by comparing the design against the brief once it was pasted in, and the stock model was redone so that holds are *calculated* from live orders. That turned out better anyway: a hold can't leak if the expiry job dies.
2. **It put the lock ordering at risk of deadlocks.** The first version of `decrementStock` sorted product UUIDs with JavaScript `localeCompare` to decide lock order, while order creation locked rows using Postgres `ORDER BY id`. The two orderings aren't guaranteed to match, which could deadlock a pickup against a new order. It was caught in review and changed so every path uses the same `lockProducts()` SQL.
3. **It created a circular import**: route files imported `asyncHandler` from `app.ts`, which imports the route files. It was caught before the first run and moved into `middleware/error-handler.ts`.

**How we checked the concurrency tests prove something:** a race test that passes might just be lucky timing. So the product lock was deliberately removed from order creation, and the "10 customers, 2 units" test failed: 6 orders held the last 2 units. Loosening the pickup `UPDATE` made the pickup race test fail with two successes. Both changes were then reverted. Separately, the customer screen was loaded in a browser with the device clock set 7 minutes fast to confirm the countdown still showed the right time.

_TODO: write 2–4 lines on what you personally reviewed, ran or changed, e.g. "I ran the tests against my Neon test branch", "I traced the webhook transaction by hand", "I changed X because Y". Interviewers will ask about this._
