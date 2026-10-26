// Copies SQL migrations next to the bundled migrate.js (cross-platform, no `cp -r`).
import { cpSync } from 'node:fs';

cpSync('apps/api/src/db/migrations', 'dist/api/migrations', { recursive: true });
console.log('[build] copied migrations to dist/api/migrations');
