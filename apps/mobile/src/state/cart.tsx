import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearCartToken, getCartToken } from '../api/client';
import * as resources from '../api/resources';
import type { Cart } from '../api/types';
import { useI18n } from '../i18n';
import { useAuth } from './auth';

interface CartState {
  cart: Cart | null;
  loading: boolean;
  refresh: () => Promise<void>;
  add: (input: Parameters<typeof resources.addToCart>[0]) => Promise<void>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  count: number;
}

const CartContext = createContext<CartState | null>(null);

/**
 * The cart, which belongs to the phone before it belongs to an account.
 *
 * A guest builds a cart against a token; signing in folds that cart into the
 * account, so nothing chosen on the way to the till is lost at the till.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const { user, ready } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCart(await resources.getCart(locale));
    } catch {
      // A cart that will not load is not worth an error screen over the whole
      // app; the cart tab shows the empty state and a retry.
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  // Signing in merges whatever the guest had built up.
  useEffect(() => {
    if (!user) return;

    void (async () => {
      const token = await getCartToken();
      if (!token) return;

      try {
        setCart(await resources.mergeCart(token));
      } catch {
        await clearCartToken();
        await refresh();
      }
    })();
  }, [user, refresh]);

  const add = useCallback(async (input: Parameters<typeof resources.addToCart>[0]) => {
    setCart(await resources.addToCart(input));
  }, []);

  const setQuantity = useCallback(async (itemId: string, quantity: number) => {
    setCart(
      quantity <= 0
        ? await resources.removeCartItem(itemId)
        : await resources.updateCartItem(itemId, quantity),
    );
  }, []);

  const remove = useCallback(async (itemId: string) => {
    setCart(await resources.removeCartItem(itemId));
  }, []);

  const value = useMemo<CartState>(
    () => ({
      cart,
      loading,
      refresh,
      add,
      setQuantity,
      remove,
      count: cart?.itemCount ?? 0,
    }),
    [cart, loading, refresh, add, setQuantity, remove],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}
