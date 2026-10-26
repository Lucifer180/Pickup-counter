import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),

  WEBHOOK_SECRET: z.string().min(8, 'WEBHOOK_SECRET must be at least 8 characters'),

  HOLD_SECONDS: z.coerce.number().int().positive().default(120),
  EXPIRE_JOB_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  ENABLE_EXPIRE_JOB: bool.default('true'),

  ENABLE_PAYMENT_SIMULATOR: bool.default('false'),

  CORS_ORIGIN: z.string().default('http://localhost:5173,https://lucifer180.github.io'),

  WEB_DIST_DIR: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');

  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
