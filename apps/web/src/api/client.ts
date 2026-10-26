export type OrderStatus = 'pending' | 'paid' | 'expired' | 'needs_review' | 'picked_up';

export interface Product {
  id: string;
  name: string;
  pricePaise: number;
  stock: number;
  availableUnits: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  totalPaise: number;
  currency: 'INR';
  items: { productId: string; name: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }[];
  expiresInSeconds: number;
  reviewReason: string | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  listProducts: () => request<Product[]>('GET', '/products'),
  createOrder: (items: { productId: string; quantity: number }[]) => request<Order>('POST', '/orders', items),
  getOrder: (id: string) => request<Order>('GET', `/orders/${id}`),
  simulatePayment: (orderId: string, amountPaise?: number) =>
    request<{ order: Order }>('POST', '/payments/simulate', { orderId, amountPaise }),
  claimPickup: (orderId: string) => request<{ claimed: true; order: Order }>('POST', `/orders/${orderId}/pickup-claim`),
};

export function formatPaise(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const rest = String(Math.abs(paise % 100)).padStart(2, '0');
  return `₹${rupees.toLocaleString('en-IN')}.${rest}`;
}
