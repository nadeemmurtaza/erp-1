'use client';

import { createContext, useContext } from 'react';

const EnabledModulesContext = createContext<readonly string[] | undefined>(undefined);

export const EnabledModulesProvider = EnabledModulesContext.Provider;

/**
 * Which API modules `GET /meta` reported for this deployment — the same
 * value `AdminShell` already fetches for `navFor()`, made available to page
 * content too, so the dashboard, settings and any other page can hide a
 * section tagged with a module that is off without each fetching `/meta`
 * itself. `undefined` means "not fetched yet"; pair with `isModuleEnabled()`
 * (utils/module-gate.ts), which treats that the same as "show it" rather
 * than hiding everything until this resolves.
 */
export function useEnabledModules(): readonly string[] | undefined {
  return useContext(EnabledModulesContext);
}
