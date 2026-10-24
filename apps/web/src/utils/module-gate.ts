/**
 * Whether a piece of admin UI tagged with an API module name should render
 * for this deployment — the one predicate nav-registry.ts's `navFor()`, the
 * dashboard and the settings page all share, so "is this module on?" is
 * answered the same way everywhere rather than three times.
 *
 * `undefined`/`null` module means universal (every deployment shows it).
 * `undefined`/`null` enabledModules means "not fetched yet" — fails OPEN
 * (shows the item) rather than hiding every module-tagged item until
 * `GET /meta` resolves, the same choice `navFor()` already made.
 */
export function isModuleEnabled(
  module: string | undefined | null,
  enabledModules: readonly string[] | null | undefined,
): boolean {
  return !module || !enabledModules || enabledModules.includes(module);
}
