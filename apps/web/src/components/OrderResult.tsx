import { Link } from 'react-router-dom';
import type { Order } from '../api/client';

const COPY: Record<Exclude<Order['status'], 'pending'>, { tone: string; title: string; body: string }> = {
  paid: {
    tone: 'success',
    title: 'Payment received',
    body: 'Your order is ready. Collect it from the locker using your order number.',
  },
  picked_up: { tone: 'success', title: 'Collected', body: 'Enjoy your snacks!' },
  expired: {
    tone: 'warning',
    title: 'Time ran out',
    body: 'We did not receive your payment within 2 minutes, so the items were released. If money left your account, it will be refunded.',
  },
  needs_review: {
    tone: 'error',
    title: 'We need to check your payment',
    body: 'Something about this payment did not match. Please ask staff at the counter; you will get your order or a full refund.',
  },
};

export function OrderResult({ order }: { order: Order }) {
  if (order.status === 'pending') return null;
  const copy = COPY[order.status];
  return (
    <div className={`result ${copy.tone}`} role="status">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      <p className="order-no">
        Order no. <strong>{order.id.slice(0, 8).toUpperCase()}</strong>
      </p>
      <Link to="/" className="button">
        Start a new order
      </Link>
    </div>
  );
}
