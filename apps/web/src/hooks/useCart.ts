import { useMemo, useState } from 'react';
import type { Product } from '../api/client';

export function useCart(products: Product[]) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const lines = useMemo(
    () =>
      products
        .filter((p) => (quantities[p.id] ?? 0) > 0)
        .map((p) => ({ product: p, quantity: quantities[p.id]! })),
    [products, quantities],
  );
  const totalPaise = lines.reduce((sum, l) => sum + l.product.pricePaise * l.quantity, 0);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);

  const setQuantity = (productId: string, quantity: number) =>
    setQuantities((q) => ({ ...q, [productId]: Math.max(0, quantity) }));

  return {
    lines,
    totalPaise,
    count,
    quantityOf: (id: string) => quantities[id] ?? 0,
    add: (id: string) => setQuantity(id, (quantities[id] ?? 0) + 1),
    remove: (id: string) => setQuantity(id, (quantities[id] ?? 0) - 1),
    clear: () => setQuantities({}),
  };
}
