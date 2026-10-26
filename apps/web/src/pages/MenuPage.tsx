import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { CartSummary } from '../components/CartSummary';
import { ProductList } from '../components/ProductList';
import { useCart } from '../hooks/useCart';
import { useProducts } from '../hooks/useProducts';

export function MenuPage() {
  const { products, loading, error, refresh } = useProducts();
  const cart = useCart(products);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function placeOrder() {
    setPlacing(true);
    setOrderError(null);
    const sentAt = performance.now();
    try {
      const order = await api.createOrder(cart.lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })));
      cart.clear();
      navigate(`/pay/${order.id}`, { state: { snapshot: { order, sentAt } } });
    } catch (e) {

      setOrderError(e instanceof ApiError ? e.message : 'Could not place the order. Please try again.');
      await refresh();
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="menu-layout">
      <section>
        <h1>Menu</h1>
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="alert error">Could not load products: {error}</p>}
        <ProductList products={products} quantityOf={cart.quantityOf} onAdd={cart.add} onRemove={cart.remove} />
      </section>
      <CartSummary
        lines={cart.lines}
        totalPaise={cart.totalPaise}
        placing={placing}
        error={orderError}
        onPlaceOrder={placeOrder}
      />
    </div>
  );
}
