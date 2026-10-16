import { createContext, useContext } from "react";
import type { TenantSummary } from "../api";
import type {
  ConnectedInstagramAccount,
  WorkspaceRole,
  WorkspaceSummary,
} from "../api/workspace";

export interface TenantContextValue {
  tenant: TenantSummary | null;
  error: string | null;
  reload: () => void;
  reloadWorkspaces: () => void;
  workspaces: WorkspaceSummary[] | null;
  workspaceError: string | null;
  workspaceRole: WorkspaceRole | null;
  connectedAccounts: ConnectedInstagramAccount[] | null;
  accountError: string | null;
  selectedAccountId: string | null;
  setSelectedAccountId: (accountId: string | null) => void;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

/** AppShell owns the signed-in workspace and account context. Nested pages use the server-backed lists rather than inventing local workspace or account records. */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within AppShell");
  return ctx;
}
