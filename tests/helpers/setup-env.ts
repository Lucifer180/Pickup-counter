// Runs before each test file, before any app module reads process.env.
import 'dotenv/config';

process.env.NODE_ENV = 'test';
// Prefer a dedicated test database. Tests TRUNCATE tables, so never point this at real data.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.WEBHOOK_SECRET ??= 'test_webhook_secret_123';
process.env.ENABLE_EXPIRE_JOB = 'false';
process.env.ENABLE_PAYMENT_SIMULATOR = 'true';
// Enough connections that concurrent requests really do run in parallel.
process.env.PG_POOL_MAX ??= '20';
