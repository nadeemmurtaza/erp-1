/**
 * Barrel for the app's type surface, so a component can pull several shapes
 * from one specifier instead of three parallel imports.
 *
 * `api.ts` is the big one — it mirrors what apps/api returns. It is currently
 * hand-maintained, which is a known weak point: nothing makes it fail when a
 * DTO changes on the server, so it drifts silently. Generating it from the
 * API's OpenAPI document is scoped but not built; until then, changing a
 * response shape in apps/api means changing it here in the same commit.
 */
export type * from './api';
export type * from './cart';
export type * from './stitching';
