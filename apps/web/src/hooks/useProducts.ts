import { useCallback, useEffect, useState } from 'react';
import { api, type Product } from '../api/client';

/** Loads the catalogue and refreshes it every few seconds so "available" stays honest. */
export function useProducts(refreshMs = 5000) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProducts(await api.listProducts());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, refreshMs);
    return () => clearInterval(t);
  }, [refresh, refreshMs]);

  return { products, loading, error, refresh };
}
