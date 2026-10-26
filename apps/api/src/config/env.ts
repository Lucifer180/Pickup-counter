import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // Neon connection string, e.g. postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Shared secret used to verify X-Signature on the payment webhook.
  WEBHOOK_SECRET: z.string().min(8, 'WEBHOOK_SECRET must be at least 8 characters'),

  HOLD_SECONDS: z.coerce.number().int().positive().default(120),
  EXPIRE_JOB_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  ENABLE_EXPIRE_JOB: bool.default('true'),

  // Lets the customer screen trigger a signed test webhook. Never enable in production.
  ENABLE_PAYMENT_SIMULATOR: bool.default('false'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // When set, the API also serves the built React app from this folder.
  WEB_DIST_DIR: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
