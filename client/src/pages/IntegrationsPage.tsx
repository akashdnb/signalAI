import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import { workspaceApi, type ConnectedInstagramAccount, type WorkspaceRole } from "../api/workspace";
import { CrmMarkIcon, InstagramMarkIcon, WhatsAppMarkIcon } from "../components/icons";

function formatDate(iso: string | null): string {
  if (!iso) return "Not available";
  return new Date(iso).toLocaleString();
}

export function IntegrationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<ConnectedInstagramAccount[] | null>(null);
  const [currentRole, setCurrentRole] = useState<WorkspaceRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function loadAccounts() {
    if (!tenantId) return;
    try {
      const [nextAccounts, workspaces] = await Promise.all([
        workspaceApi.listConnectedAccounts(tenantId),
        workspaceApi.listWorkspaces(),
      ]);
      const workspace = workspaces.find((item) => item.tenantId === tenantId);
      if (!workspace) {
        setAccounts(null);
        setCurrentRole(null);
        setError("This workspace is not available to your account.");
        return;
      }
      setAccounts(nextAccounts);
      setCurrentRole(workspace.role);
      setError(null);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      if (status === 403) {
        setAccounts(null);
        setCurrentRole(null);
        setError("You do not have access to these connected accounts.");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load Instagram accounts");
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, [tenantId]);

  async function handleConnect() {
    if (!tenantId) return;
    setConnecting(true);
    setError(null);
    try {
      const { url } = await api.startInstagramConnect(tenantId);
      window.location.href = url;
    } catch (err) {
      setConnecting(false);
      setError(err instanceof Error ? err.message : "Couldn't start the Instagram connection");
    }
  }

  async function handleReconnect(accountId: string) {
    if (!tenantId) return;
    setReconnectingId(accountId);
    setError(null);
    try {
      const { url } = await workspaceApi.startInstagramReconnect(tenantId, accountId);
      window.location.href = url;
    } catch (err) {
      setReconnectingId(null);
      setError(err instanceof Error ? err.message : "Couldn't start the Instagram reconnect");
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!tenantId) return;
    setDisconnectingId(accountId);
    setError(null);
    try {
      await workspaceApi.disconnectAccount(tenantId, accountId);
      setConfirmingId(null);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect Instagram");
    } finally {
      setDisconnectingId(null);
    }
  }

  if (!tenantId) return null;

  return (
    <div className="page page-wide">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Integrations</h1>
          <p className="muted">Connect the channels SignalAI can send and receive messages through. Connection health and the latest check are shown for each Instagram account.</p>
        </div>
        <button className="btn-primary btn-small" onClick={handleConnect} disabled={(currentRole !== "owner" && currentRole !== "admin") || connecting || reconnectingId !== null} title={currentRole !== "owner" && currentRole !== "admin" ? "Only owners and admins can connect Instagram accounts" : undefined}>
          <span className="inline-flex items-center gap-1.5">
            <InstagramMarkIcon className="h-4 w-4" />
            {connecting ? "Redirecting…" : "Add Instagram account"}
          </span>
        </button>
      </div>

      {error && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          {accounts === null && <button type="button" className="link-button" onClick={() => void loadAccounts()}>Retry loading accounts</button>}
        </div>
      )}

      {currentRole === "member" && <p className="banner" role="status">You have read-only access to connected accounts. Workspace owners and admins can connect, reconnect, or disconnect Instagram.</p>}

      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 style={{ marginBottom: 0 }}>Instagram accounts</h2>
          <span className="muted small">{accounts?.length ?? 0} connected</span>
        </div>

        {accounts === null ? (
          <p className="muted">Checking connections…</p>
        ) : accounts.length === 0 ? (
          <div className="banner">
            <p className="m-0">No Instagram accounts are connected yet. Add one to start automating comments and DMs.</p>
          </div>
        ) : (
          <div className="list" style={{ marginTop: "1rem" }}>
            {accounts.map((account) => (
              <div key={account.id} className="list-item" style={{ alignItems: "flex-start" }}>
                <span className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
                    <InstagramMarkIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong>{account.instagramUsername ? `@${account.instagramUsername}` : "Instagram account"}</strong>
                      <span className={account.status === "healthy" ? "pill pill-ok" : "pill pill-error"}>
                        {account.status === "healthy" ? "Healthy" : "Needs attention"}
                      </span>
                    </span>
                    {!account.instagramUsername && (
                      <p className="muted small mt-1 mb-0">The handle will appear after this account is successfully reconnected.</p>
                    )}
                    <details className="mt-1 text-xs text-subtle"><summary className="cursor-pointer">Advanced account details</summary><p className="mb-0 mt-1 break-all"><code>{account.instagramAccountId}</code></p></details>
                    <p className="muted small mt-1 mb-0">Last checked: {formatDate(account.lastCheckedAt)}</p>
                    {account.expiresAt && <p className="muted small mt-1 mb-0">Connection credential expires: {formatDate(account.expiresAt)}</p>}
                    {account.status === "error" && account.lastError && (
                      <span className="banner banner-error small mt-2" style={{ display: "block" }}>{account.lastError}</span>
                    )}
                    {account.status === "error" && (
                      <p className="muted small mt-2 mb-0">Automatic replies for journeys assigned to this account are paused while the connection is unhealthy. Reconnect to restore the connection, then verify the account status here.</p>
                    )}
                  </span>
                </span>

                <span className="flex shrink-0 gap-2">
                  {(currentRole === "owner" || currentRole === "admin") && account.status === "error" ? (
                    <button
                      className="btn-primary btn-small"
                      onClick={() => void handleReconnect(account.id)}
                      disabled={reconnectingId === account.id || connecting}
                    >
                      {reconnectingId === account.id ? "Redirecting…" : "Reconnect"}
                    </button>
                  ) : (currentRole === "owner" || currentRole === "admin") && confirmingId === account.id ? (
                    <>
                      <button className="btn-primary btn-small" onClick={() => void handleDisconnect(account.id)} disabled={disconnectingId === account.id}>
                        {disconnectingId === account.id ? "Disconnecting…" : "Confirm"}
                      </button>
                      <button className="btn-secondary btn-small" onClick={() => setConfirmingId(null)} disabled={disconnectingId === account.id}>
                        Cancel
                      </button>
                    </>
                  ) : currentRole === "owner" || currentRole === "admin" ? (
                    <button className="btn-secondary btn-small" onClick={() => setConfirmingId(account.id)}>
                      Disconnect
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
          <WhatsAppMarkIcon className="h-6 w-6" />
        </span>
        <div>
          <div className="flex items-center gap-2"><h3 className="m-0">WhatsApp</h3><span className="pill" style={{ marginLeft: 0 }}>Coming soon</span></div>
          <p className="muted small mt-1">Not available yet. This card is informational and does not create a connection.</p>
        </div>
      </section>

      <section className="card flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
          <CrmMarkIcon className="h-6 w-6" />
        </span>
        <div>
          <div className="flex items-center gap-2"><h3 className="m-0">CRM sync</h3><span className="pill" style={{ marginLeft: 0 }}>Coming soon</span></div>
          <p className="muted small mt-1">Not available yet. Qualified leads remain in SignalAI until CRM sync is supported.</p>
        </div>
      </section>
    </div>
  );
}
