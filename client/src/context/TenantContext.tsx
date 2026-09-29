import { createContext, useContext } from "react";
import type { TenantSummary } from "../api";

export interface TenantContextValue {
  tenant: TenantSummary | null;
  error: string | null;
  reload: () => void;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

/** AppShell fetches the tenant once and provides it here, so pages nested under it (Dashboard, Settings, ...) don't each issue their own duplicate `getTenant` request. */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within AppShell");
  return ctx;
}
