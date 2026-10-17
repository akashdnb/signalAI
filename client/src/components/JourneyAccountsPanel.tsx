import { useEffect, useState } from "react";
import { workspaceApi, type ConnectedInstagramAccount, type JourneyAccountBinding } from "../api/workspace";
import { useTenant } from "../context/TenantContext";

export type JourneyAccountReadiness = {
  status: "loading" | "ready" | "error";
  healthyAssignedCount: number;
  unavailableAssignedCount: number;
};

const initialReadiness: JourneyAccountReadiness = {
  status: "loading",
  healthyAssignedCount: 0,
  unavailableAssignedCount: 0,
};

const readinessSnapshots = new Map<string, JourneyAccountReadiness>();
const readinessListeners = new Map<string, Set<() => void>>();

function readinessKey(tenantId: string, campaignId: string): string {
  return `${tenantId}:${campaignId}`;
}

export function getJourneyAccountReadiness(tenantId: string, campaignId: string): JourneyAccountReadiness {
  return readinessSnapshots.get(readinessKey(tenantId, campaignId)) ?? initialReadiness;
}

export function subscribeJourneyAccountReadiness(
  tenantId: string,
  campaignId: string,
  listener: () => void,
): () => void {
  const key = readinessKey(tenantId, campaignId);
  const listeners = readinessListeners.get(key) ?? new Set<() => void>();
  listeners.add(listener);
  readinessListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) readinessListeners.delete(key);
  };
}

function publishJourneyAccountReadiness(
  tenantId: string,
  campaignId: string,
  readiness: JourneyAccountReadiness,
): void {
  const key = readinessKey(tenantId, campaignId);
  const previous = readinessSnapshots.get(key);
  if (
    previous?.status === readiness.status &&
    previous.healthyAssignedCount === readiness.healthyAssignedCount &&
    previous.unavailableAssignedCount === readiness.unavailableAssignedCount
  ) {
    return;
  }

  readinessSnapshots.set(key, readiness);
  readinessListeners.get(key)?.forEach((listener) => listener());
}

interface Props {
  tenantId: string;
  campaignId: string;
  onReadinessChange?: (readiness: JourneyAccountReadiness) => void;
}

export function JourneyAccountsPanel({ tenantId, campaignId, onReadinessChange }: Props) {
  const { workspaceRole, workspaceError } = useTenant();
  const canManageAccounts = workspaceRole === "owner" || workspaceRole === "admin";
  const [accounts, setAccounts] = useState<ConnectedInstagramAccount[]>([]);
  const [bindings, setBindings] = useState<JourneyAccountBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [nextAccounts, nextBindings] = await Promise.all([
        workspaceApi.listConnectedAccounts(tenantId),
        workspaceApi.listJourneyAccounts(tenantId, campaignId),
      ]);
      setAccounts(nextAccounts);
      setBindings(nextBindings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connected accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId, campaignId]);

  async function toggle(account: ConnectedInstagramAccount) {
    if (account.status !== "healthy") return;

    const bound = bindings.some((binding) => binding.accountId === account.id && binding.enabled);
    setSavingId(account.id);
    setError(null);
    try {
      if (bound) {
        await workspaceApi.detachJourneyAccount(tenantId, campaignId, account.id);
      } else {
        await workspaceApi.attachJourneyAccount(tenantId, campaignId, account.id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update journey account assignment");
    } finally {
      setSavingId(null);
    }
  }

  const assignedCount = bindings.filter((binding) => binding.enabled).length;
  const healthyAccountIds = new Set(accounts.filter((account) => account.status === "healthy").map((account) => account.id));
  const healthyAssignedCount = bindings.filter((binding) => binding.enabled && healthyAccountIds.has(binding.accountId)).length;
  const unavailableAssignedCount = assignedCount - healthyAssignedCount;
  const healthyAccounts = accounts.filter((account) => account.status === "healthy");

  useEffect(() => {
    const readiness: JourneyAccountReadiness = {
      status: loading ? "loading" : error ? "error" : "ready",
      healthyAssignedCount,
      unavailableAssignedCount,
    };
    onReadinessChange?.(readiness);
    publishJourneyAccountReadiness(tenantId, campaignId, readiness);
  }, [loading, error, healthyAssignedCount, unavailableAssignedCount, onReadinessChange, tenantId, campaignId]);

  return (
    <section className="journey-account-panel card" style={{ marginBottom: "0.75rem" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ marginBottom: 2 }}>Connected Instagram accounts</h2>
          <p className="muted small m-0">This journey is reusable. Attach it to any healthy accounts that should run it.</p>
        </div>
        <span className={healthyAssignedCount > 0 ? "pill pill-ok" : "pill pill-error"} style={{ marginLeft: 0 }}>
          {healthyAssignedCount} healthy assigned{unavailableAssignedCount > 0 ? ` · ${unavailableAssignedCount} unavailable` : ""}
        </span>
      </div>

      {error && <div className="banner banner-error mt-3" role="alert">{error}</div>}
      {workspaceRole === null && (
        <div className="banner banner-error mt-3" role={workspaceError ? "alert" : "status"}>
          {workspaceError ? "Workspace access could not be verified. Account assignments are read-only until access can be checked." : "Checking workspace permissions…"}
        </div>
      )}
      {workspaceRole !== null && !canManageAccounts && (
        <div className="banner mt-3" role="status">
          You can view which accounts use this journey. Only workspace owners and admins can change account assignments.
        </div>
      )}

      {loading ? (
        <p className="muted small">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <p className="muted small">No Instagram accounts are connected. Connect an account from Integrations first.</p>
      ) : (
        <>
          {healthyAccounts.length === 0 && (
            <div className="banner banner-error mt-3" role="alert">
              No healthy Instagram account is available. Reconnect an account from Integrations before enabling this journey.
            </div>
          )}
          {unavailableAssignedCount > 0 && (
            <div className="banner banner-error mt-3" role="alert">
              {unavailableAssignedCount} assigned account{unavailableAssignedCount === 1 ? " is" : "s are"} currently unavailable. Reconnect {unavailableAssignedCount === 1 ? "it" : "them"} from Integrations before enabling this journey.
            </div>
          )}
          <div className="flex flex-wrap gap-2" style={{ marginTop: "0.75rem" }}>
            {accounts.map((account) => {
              const bound = bindings.some((binding) => binding.accountId === account.id && binding.enabled);
              const healthy = account.status === "healthy";
              return (
                <button
                  key={account.id}
                  type="button"
                  className={bound ? "btn-primary btn-small" : "btn-secondary btn-small"}
                  onClick={() => void toggle(account)}
                  disabled={!healthy || !canManageAccounts || workspaceRole === null || savingId === account.id}
                  aria-pressed={bound}
                  title={!healthy ? "Reconnect this Instagram account before assigning it to a journey" : !canManageAccounts ? "Only workspace owners and admins can change journey account assignments" : undefined}
                >
                  {savingId === account.id
                    ? "Saving…"
                    : `${bound ? "✓ " : ""}@${account.instagramUsername ?? account.instagramAccountId}${healthy ? "" : " · Needs attention"}`}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
