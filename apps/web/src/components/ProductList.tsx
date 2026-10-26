import { formatPaise, type Product } from '../api/client';

interface Props {
  products: Product[];
  quantityOf: (id: string) => number;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}

export function ProductList({ products, quantityOf, onAdd, onRemove }: Props) {
  return (
    <ul className="products">
      {products.map((p) => {
        const inCart = quantityOf(p.id);
        const soldOut = p.availableUnits === 0;
        const canAdd = inCart < p.availableUnits;
        return (
          <li key={p.id} className={`card product ${soldOut ? 'sold-out' : ''}`}>
            <div>
              <div className="product-name">{p.name}</div>
              <div className="muted">{formatPaise(p.pricePaise)}</div>
            </div>
            <div className={`stock ${p.availableUnits <= 2 ? 'low' : ''}`}>
              {soldOut ? 'Sold out' : `${p.availableUnits} available`}
            </div>
            <div className="stepper" aria-label={`Quantity of ${p.name}`}>
              <button type="button" onClick={() => onRemove(p.id)} disabled={inCart === 0} aria-label="Remove one">
                −
              </button>
              <span className="qty">{inCart}</span>
              <button type="button" onClick={() => onAdd(p.id)} disabled={!canAdd} aria-label="Add one">
                +
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
