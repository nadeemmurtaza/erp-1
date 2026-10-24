'use client';

import { useLocale } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  addToCart,
  fetchCart,
  removeCartItem,
  updateCartItem,
  type AddToCartInput,
} from '@/lib/cart-client';
import type { Cart } from '@/types/cart';

interface CartContextValue {
  cart: Cart | null;
  /** True while the first load is in flight, so the badge does not flash. */
  loading: boolean;
  error: string | null;
  add: (input: AddToCartInput) => Promise<void>;
  update: (
    itemId: string,
    patch: { quantity?: number; measurementProfileId?: string },
  ) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  clearError: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Holds the cart for the whole storefront.
 *
 * Every mutation returns the freshly priced cart from the API and replaces the
 * local copy wholesale — the client never does its own arithmetic, so what the
 * customer sees is always what the server would charge.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCart(locale)
      .then((loaded) => {
        if (!cancelled) setCart(loaded);
      })
      .catch(() => {
        // A cart that cannot be loaded must not break the page the customer is
        // reading; the badge simply stays empty.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const run = useCallback(async (action: () => Promise<Cart>) => {
    setError(null);
    try {
      setCart(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the cart');
      throw cause;
    }
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      loading,
      error,
      add: (input) => run(() => addToCart(input, locale)),
      update: (itemId, patch) => run(() => updateCartItem(itemId, patch, locale)),
      remove: (itemId) => run(() => removeCartItem(itemId, locale)),
      clearError: () => setError(null),
    }),
    [cart, loading, error, locale, run],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return context;
}
