import { formatPaise, type Product } from '../api/client';

interface Props {
  lines: { product: Product; quantity: number }[];
  totalPaise: number;
  placing: boolean;
  error: string | null;
  onPlaceOrder: () => void;
}

export function CartSummary({ lines, totalPaise, placing, error, onPlaceOrder }: Props) {
  return (
    <aside className="card cart">
      <h2>Your order</h2>
      {lines.length === 0 ? (
        <p className="muted">Add something from the menu.</p>
      ) : (
        <ul className="lines">
          {lines.map(({ product, quantity }) => (
            <li key={product.id}>
              <span>
                {quantity} × {product.name}
              </span>
              <span>{formatPaise(product.pricePaise * quantity)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="total">
        <span>Total</span>
        <strong>{formatPaise(totalPaise)}</strong>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="primary" disabled={lines.length === 0 || placing} onClick={onPlaceOrder}>
        {placing ? 'Holding your items…' : 'Place order & pay'}
      </button>
      <p className="muted small">Items are held for you for 2 minutes while you pay.</p>
    </aside>
  );
}
