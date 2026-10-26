import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api, formatPaise } from '../api/client';
import { Countdown } from '../components/Countdown';
import { OrderResult } from '../components/OrderResult';
import { useOrder, type OrderSnapshot } from '../hooks/useOrder';
import { useServerCountdown } from '../hooks/useServerCountdown';

const HOLD_MS = 120_000;

export function PaymentPage() {
  const { orderId = '' } = useParams();
  const initial = (useLocation().state as { snapshot?: OrderSnapshot } | null)?.snapshot;
  const { snapshot, error, refresh } = useOrder(orderId, initial);
  const msLeft = useServerCountdown(snapshot?.order.expiresInSeconds, snapshot?.sentAt);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  if (!snapshot) {
    return <p className="muted">{error ? `Could not load order: ${error}` : 'Loading order…'}</p>;
  }
  const { order } = snapshot;

  async function demo(action: () => Promise<unknown>, label: string) {
    try {
      await action();
      setDemoMessage(`${label}: done`);
    } catch (e) {
      setDemoMessage(`${label}: ${(e as Error).message}`);
    }
    await refresh();
  }

  return (
    <div className="pay-layout">
      <section className="card">
        <h1>{order.status === 'pending' ? 'Pay by UPI' : 'Order status'}</h1>
        <ul className="lines">
          {order.items.map((i) => (
            <li key={i.productId}>
              <span>
                {i.quantity} × {i.name}
              </span>
              <span>{formatPaise(i.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <div className="total">
          <span>Total</span>
          <strong>{formatPaise(order.totalPaise)}</strong>
        </div>

        {order.status === 'pending' ? (
          <>
            <div className="qr" aria-label="UPI QR code placeholder">
              <span>UPI QR</span>
              <small>{formatPaise(order.totalPaise)}</small>
            </div>
            <Countdown msLeft={msLeft} totalMs={HOLD_MS} />
            <p className="muted small">Waiting for payment… this screen updates by itself.</p>
          </>
        ) : (
          <OrderResult order={order} />
        )}
        {error && <p className="alert error">Connection problem, retrying… ({error})</p>}
      </section>

      <aside className="card demo">
        <h2>Demo tools</h2>
        <p className="muted small">
          No real UPI provider here. These buttons stand in for the provider and the locker.
          The same thing can be done from a terminal with <code>npm run send-webhook -- --order {order.id}</code>.
        </p>
        <button
          type="button"
          disabled={order.status !== 'pending'}
          onClick={() => demo(() => api.simulatePayment(order.id), 'Payment')}
        >
          Simulate UPI payment
        </button>
        <button
          type="button"
          disabled={order.status !== 'pending'}
          onClick={() => demo(() => api.simulatePayment(order.id, order.totalPaise - 100), 'Wrong amount')}
        >
          Simulate wrong amount
        </button>
        <button
          type="button"
          disabled={order.status !== 'paid'}
          onClick={() => demo(() => api.claimPickup(order.id), 'Locker pickup')}
        >
          Simulate locker pickup
        </button>
        {demoMessage && <p className="small">{demoMessage}</p>}
        <p className="muted small">
          Order id: <code>{order.id}</code>
        </p>
      </aside>
    </div>
  );
}
