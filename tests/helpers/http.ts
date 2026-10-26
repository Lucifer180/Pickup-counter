import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../apps/api/src/app';
import { computeSignature } from '../../apps/api/src/modules/payments/signature';

export async function startServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface JsonResponse<T = any> {
  status: number;
  body: T;
}

export async function api<T = any>(baseUrl: string, method: string, path: string, body?: unknown): Promise<JsonResponse<T>> {
  const res = await fetch(baseUrl + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

export async function sendWebhook(
  baseUrl: string,
  event: { eventId: string; orderId: string; amountPaise: number; status?: string },
  opts: { secret?: string; signature?: string } = {},
): Promise<JsonResponse> {
  const raw = JSON.stringify({ status: 'captured', ...event });
  const signature = opts.signature ?? computeSignature(raw, opts.secret ?? process.env.WEBHOOK_SECRET!);
  const res = await fetch(`${baseUrl}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body: raw,
  });
  return { status: res.status, body: await res.json() };
}

export async function placeOrder(baseUrl: string, productId: string, quantity = 1): Promise<{ id: string; totalPaise: number }> {
  const res = await api(baseUrl, 'POST', '/orders', [{ productId, quantity }]);
  if (res.status !== 201) throw new Error(`order failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.id, totalPaise: res.body.totalPaise };
}
