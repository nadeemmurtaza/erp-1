'use client';

import { createContext, useContext, type ComponentType, type ReactNode, type SVGProps } from 'react';
import type { ToneName } from '@/lib/tone';

/**
 * Who the page is, for its header: the glyph and tone of the part of the product it belongs to
 * (ADR-083, twelfth addendum). The admin shell knows which nav group the current route sits in, so it
 * provides that here once and every `PageHeader` below it wears the group's tile without one page
 * being edited. A page outside the shell, or a route with no group, provides nothing and its header
 * has no tile. It carries no text: the title beside the tile is what names the page.
 */
export interface PageIdentity {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: ToneName;
}

const Identity = createContext<PageIdentity | null>(null);

export function PageIdentityProvider({ value, children }: { value: PageIdentity | null; children: ReactNode }) {
  return <Identity.Provider value={value}>{children}</Identity.Provider>;
}

export function usePageIdentity(): PageIdentity | null {
  return useContext(Identity);
}
