
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { computeSignature } from '../apps/api/src/modules/payments/signature';

const { values } = parseArgs({
  options: {
    order: { type: 'string', short: 'o' },
    amount: { type: 'string', short: 'a' },
    event: { type: 'string', short: 'e' },
    status: { type: 'string', short: 's', default: 'captured' },
    repeat: { type: 'string', short: 'r', default: '1' },
    url: { type: 'string', default: process.env.API_URL ?? 'http://localhost:4000' },
    'bad-signature': { type: 'boolean', default: false },
  },
});

async function main(): Promise<void> {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) throw new Error('WEBHOOK_SECRET is not set (copy .env.example to .env)');
  if (!values.order) throw new Error('Pass the order id: npm run send-webhook -- --order <orderId>');

  const base = values.url!.replace(/\/$/, '');
  let amountPaise = values.amount ? Number.parseInt(values.amount, 10) : undefined;
  if (amountPaise === undefined) {
    const res = await fetch(`${base}/orders/${values.order}`);
    if (!res.ok) throw new Error(`Could not load order ${values.order}: HTTP ${res.status} ${await res.text()}`);
    amountPaise = ((await res.json()) as { totalPaise: number }).totalPaise;
  }

  const body = JSON.stringify({
    eventId: values.event ?? `evt_${randomUUID()}`,
    orderId: values.order,
    amountPaise,
    status: values.status,
  });
  const signature = values['bad-signature'] ? computeSignature(body, 'wrong-secret') : computeSignature(body, secret);

  const repeat = Math.max(1, Number.parseInt(values.repeat!, 10) || 1);
  console.log(`POST ${base}/payments/webhook  x${repeat}\n${body}\nX-Signature: ${signature}\n`);
  for (let i = 1; i <= repeat; i++) {
    const res = await fetch(`${base}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
      body,
    });
    console.log(`#${i} -> ${res.status} ${await res.text()}`);
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
