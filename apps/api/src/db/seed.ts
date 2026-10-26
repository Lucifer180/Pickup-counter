import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export const SEED_PRODUCTS = [
  { name: 'Masala Chai', pricePaise: 2000, stock: 25 },
  { name: 'Filter Coffee', pricePaise: 3000, stock: 20 },
  { name: 'Veg Samosa', pricePaise: 1500, stock: 15 },
  { name: 'Paneer Puff', pricePaise: 4500, stock: 8 },
  { name: 'Chocolate Brownie', pricePaise: 6000, stock: 3 },
] as const;

export async function seed(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    for (const p of SEED_PRODUCTS) {
      await client.query(
        `INSERT INTO products (name, price_paise, stock) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET price_paise = EXCLUDED.price_paise`,
        [p.name, p.pricePaise, p.stock],
      );
    }
    console.log(`[seed] ${SEED_PRODUCTS.length} products ready`);
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  seed(url).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
