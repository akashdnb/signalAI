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
  workspaces: WorkspaceSummary[] | null;
  workspaceError: string | null;
  reloadWorkspaces: () => void;
  workspaceRole: WorkspaceRole | null;
  connectedAccounts: ConnectedInstagramAccount[] | null;
  accountError: string | null;
  reloadConnectedAccounts: () => void;
  selectedAccountId: string | null;
  setSelectedAccountId: (accountId: string | null) => void;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

/** AppShell owns the signed-in workspace and account context. Nested pages consume server-backed lists, never local demo records. */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within AppShell");
  return ctx;
}
