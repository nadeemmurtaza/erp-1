/**
 * The cart, from anywhere in the storefront.
 *
 * The state itself lives in CartProvider — it has to, because the cart is
 * shared across the header badge, the product page and checkout at once, and
 * a hook holding its own state would give each of them a different cart.
 *
 * This is here so `hooks/` is where you look for "how do I read the cart",
 * rather than having to know it is a context exported from a component file.
 * It adds no behaviour.
 */
export { useCart } from '@/components/storefront/cart-provider';
