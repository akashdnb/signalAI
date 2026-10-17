import { useEffect, useRef, useState } from "react";
import { useTenant } from "../context/TenantContext";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { workspaceApi, type ConnectedInstagramAccount, type WorkspaceRole } from "../api/workspace";
import { CrmMarkIcon, InstagramMarkIcon, WhatsAppMarkIcon } from "../components/icons";
import { PageHeader, StatusBadge } from "../components/ui";

function formatDate(iso: string | null): string {
  if (!iso) return "Not available";
  return new Date(iso).toLocaleString();
}

export function IntegrationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const activeTenantIdRef = useRef<string | undefined>(tenantId);
  activeTenantIdRef.current = tenantId;
  const loadRequestIdRef = useRef(0);
  const navigate = useNavigate();
  const { reloadConnectedAccounts } = useTenant();
  const [accounts, setAccounts] = useState<ConnectedInstagramAccount[] | null>(null);
  const [currentRole, setCurrentRole] = useState<WorkspaceRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function loadAccounts() {
    if (!tenantId || activeTenantIdRef.current !== tenantId) return;
    const requestedTenantId = tenantId;
    const requestId = ++loadRequestIdRef.current;
    const isCurrentRequest = () =>
      requestId === loadRequestIdRef.current && activeTenantIdRef.current === requestedTenantId;
    setAccounts(null);
    setCurrentRole(null);
    setError(null);
    setConfirmingId(null);
    try {
      const [nextAccounts, workspaces] = await Promise.all([
        workspaceApi.listConnectedAccounts(requestedTenantId),
        workspaceApi.listWorkspaces(),
      ]);
      if (!isCurrentRequest()) return;
      const workspace = workspaces.find((item) => item.tenantId === requestedTenantId);
      if (!workspace) {
        setAccounts(null);
        setCurrentRole(null);
        setError("This workspace is not available to your account.");
        return;
      }
      setAccounts(nextAccounts);
      setCurrentRole(workspace.role);
      setError(null);
      reloadConnectedAccounts();
    } catch (err) {
      if (!isCurrentRequest()) return;
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
    loadRequestIdRef.current += 1;
    void loadAccounts();
    return () => {
      loadRequestIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <PageHeader
        eyebrow="Workspace connections"
        title="Integrations"
        description="Connect the channels SignalAI can send and receive messages through. Connection health and the latest check are shown for each Instagram account."
        actions={
          <button
            type="button"
            className="btn-primary btn-small"
            onClick={handleConnect}
            disabled={(currentRole !== "owner" && currentRole !== "admin") || connecting || reconnectingId !== null}
            title={currentRole !== "owner" && currentRole !== "admin" ? "Only owners and admins can connect Instagram accounts" : undefined}
          >
            <span className="inline-flex items-center gap-1.5">
              <InstagramMarkIcon className="h-4 w-4" />
              {connecting ? "Redirecting…" : "Add Instagram account"}
            </span>
          </button>
        }
      />

      {error && (
        <div className="banner banner-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          {accounts === null && <button type="button" className="link-button" onClick={() => void loadAccounts()}>Retry loading accounts</button>}
        </div>
      )}

      {currentRole === "member" && <p className="banner" role="status">You have read-only access to connected accounts. Workspace owners and admins can connect, reconnect, or disconnect Instagram.</p>}

      <section className="card integration-accounts" aria-labelledby="integration-accounts-title">
        <div className="integration-section-heading">
          <div className="min-w-0">
            <h2 id="integration-accounts-title" className="mb-1">Instagram accounts</h2>
            <p className="muted small m-0">Connection health and credential expiry are based on the latest server check.</p>
          </div>
          <span className="muted small shrink-0" role="status">{accounts === null ? "Checking connections…" : `${accounts.length} connected`}</span>
        </div>

        {accounts === null ? (
          <p className="muted" role="status">Checking connected Instagram accounts…</p>
        ) : accounts.length === 0 ? (
          <div className="integration-empty-state">
            <strong>No Instagram accounts connected yet</strong>
            <p className="muted m-0 mt-1 text-sm">Connect an account to start automating Instagram comments and direct messages. You can assign healthy accounts to individual automations after connecting.</p>
          </div>
        ) : (
          <div className="list" style={{ marginTop: "1rem" }}>
            {accounts.map((account) => (
              <div key={account.id} className="list-item integration-account-row">
                <span className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
                    <InstagramMarkIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong>{account.instagramUsername ? `@${account.instagramUsername}` : "Instagram account"}</strong>
                      <StatusBadge tone={account.status === "healthy" ? "success" : "danger"} dot>
                        {account.status === "healthy" ? "Healthy" : "Needs attention"}
                      </StatusBadge>
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

                <span className="integration-account-actions flex shrink-0 gap-2">
                  {(currentRole === "owner" || currentRole === "admin") && account.status === "error" ? (
                    <button
                      className="btn-primary btn-small"
                      onClick={() => void handleReconnect(account.id)}
                      disabled={reconnectingId === account.id || connecting}
                    >
                      {reconnectingId === account.id ? "Redirecting…" : "Reconnect"}
                    </button>
                  ) : currentRole === "owner" || currentRole === "admin" ? (
                    confirmingId === account.id ? (
                      <>
                        <button className="btn-primary btn-small" onClick={() => void handleDisconnect(account.id)} disabled={disconnectingId === account.id}>
                          {disconnectingId === account.id ? "Disconnecting…" : "Confirm"}
                        </button>
                        <button className="btn-secondary btn-small" onClick={() => setConfirmingId(null)} disabled={disconnectingId === account.id}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button className="btn-secondary btn-small" onClick={() => setConfirmingId(account.id)}>
                        Disconnect
                      </button>
                    )
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
