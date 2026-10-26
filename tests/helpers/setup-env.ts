
import 'dotenv/config';

process.env.NODE_ENV = 'test';

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.WEBHOOK_SECRET ??= 'test_webhook_secret_123';
process.env.ENABLE_EXPIRE_JOB = 'false';
process.env.ENABLE_PAYMENT_SIMULATOR = 'true';

process.env.PG_POOL_MAX ??= '20';
