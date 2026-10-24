import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names and resolves Tailwind conflicts, last one winning.
 *
 * `clsx` alone cannot do the second half. Given `cn('px-4', 'px-6')` it
 * returns BOTH classes, and which one paints is then decided by their order
 * in the generated stylesheet rather than by the order you wrote them — so a
 * component that accepts a `className` override appears to ignore it, at
 * random, depending on how Tailwind happened to sort that pair. `twMerge`
 * drops the losing class so the override always wins.
 *
 * Use this anywhere a component takes a `className` prop it merges with its
 * own defaults. Plain `clsx` is still fine for purely conditional class sets
 * that cannot collide (`clsx(isOpen && 'block')`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
