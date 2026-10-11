import { useEffect, useState } from "react";
import { workspaceApi, type ConnectedInstagramAccount, type JourneyAccountBinding } from "../api/workspace";

interface Props {
  tenantId: string;
  campaignId: string;
}

export function JourneyAccountsPanel({ tenantId, campaignId }: Props) {
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

  return (
    <section className="card" style={{ marginBottom: "0.75rem" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 style={{ marginBottom: 2 }}>Connected Instagram accounts</h2>
          <p className="muted small m-0">This journey is reusable. Attach it to any accounts that should run it.</p>
        </div>
        <span className="pill" style={{ marginLeft: 0 }}>{bindings.filter((binding) => binding.enabled).length} assigned</span>
      </div>

      {error && <div className="banner banner-error mt-3" role="alert">{error}</div>}

      {loading ? (
        <p className="muted small">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <p className="muted small">No Instagram accounts are connected. Connect an account from Integrations first.</p>
      ) : (
        <div className="flex flex-wrap gap-2" style={{ marginTop: "0.75rem" }}>
          {accounts.map((account) => {
            const bound = bindings.some((binding) => binding.accountId === account.id && binding.enabled);
            return (
              <button
                key={account.id}
                type="button"
                className={bound ? "btn-primary btn-small" : "btn-secondary btn-small"}
                onClick={() => void toggle(account)}
                disabled={savingId === account.id}
                aria-pressed={bound}
              >
                {savingId === account.id ? "Saving…" : `${bound ? "✓ " : ""}@${account.instagramAccountId}`}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
