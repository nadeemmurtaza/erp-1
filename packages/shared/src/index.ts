export * from './collection-rules';
export * from './constants';
export * from './content-blocks';
export * from './discounts';
export * from './enums';
export * from './entities';
export * from './human-code';
export * from './fabric-estimate';
export * from './onsite-messaging';
export * from './permissions';
export * from './phone';
export * from './pricing';
// secret-crypto is NOT re-exported here on purpose — it is the one file in
// this package that touches `node:crypto`, and every other export in this
// barrel is imported from apps/web client components. `next build` bundles
// the whole compiled barrel (packages/shared is CommonJS, so webpack cannot
// tree-shake a `require()` it cannot prove side-effect-free) the moment
// anything is imported from '@newax/shared' in a 'use client' file, which
// pulls `node:crypto` into the browser bundle and fails webpack with
// "UnhandledSchemeError: Reading from node:crypto". Its two API-only callers
// (trading-partners.service.ts, email-accounts.service.ts) import it from
// the dedicated '@newax/shared/secret-crypto' subpath instead — see this
// package's package.json "exports" map.
export * from './segment-filter';
export * from './slug';
export * from './sku';
export * from './variant-matrix';
export * from './brand';
export * from './http-client';
export * from './theme-colors';
export * from './theme-radii';
export * from './theme-type';
export * from './units';
export * from './measurements/types';
export * from './measurements/schema';
export * from './measurements/defaults';
