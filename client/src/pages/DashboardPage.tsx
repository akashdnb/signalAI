import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, clearSession, loadSession, type AccountHealth, type Analytics, type LeadListItem, type TenantSummary } from "../api";
import { CampaignsPanel } from "../components/CampaignsPanel";
import { BillingPanel } from "../components/BillingPanel";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatLastContactVia(lastEventType: string | null): string {
  if (lastEventType === "comment") return "Comment";
  if (lastEventType === "message") return "DM";
  return "—";
}

export function DashboardPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [account, setAccount] = useState<AccountHealth | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const justConnected = searchParams.get("connected") === "1";

  useEffect(() => {
    const session = loadSession();
    // Identity Refactor U6: an expired/revoked session (401/403 from the API
    // calls below) also clears storage — see api.ts's `request` — and lands
    // back here on the next render with no session, so this guard handles
    // both "never logged in" and "session just died" the same way.
    if (!tenantId || !session || session.tenantId !== tenantId) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const [t, a, an, l] = await Promise.all([
          api.getTenant(tenantId!),
          api.getAccountHealth(tenantId!),
          api.getAnalytics(tenantId!),
          api.getLeads(tenantId!),
        ]);
        if (cancelled) return;
        setTenant(t);
        setAccount(a);
        setAnalytics(an);
        setLeads(l);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate]);

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  async function handleConnectInstagram() {
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

  if (!tenantId) return null;

  return (
    <div className="page">
      <header className="dashboard-header">
        <div>
          <h1>{tenant?.name ?? "Your dashboard"}</h1>
          <p className="muted small">Tenant ID: {tenantId}</p>
        </div>
        <button className="btn-secondary" onClick={handleLogout}>
          Log out
        </button>
      </header>

      {error && <div className="banner banner-error">{error}</div>}
      {justConnected && (
        <div className="banner banner-ok">
          Instagram connected.{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="card">
        <h2>Account Health</h2>
        {account === null ? (
          <p className="muted">Loading…</p>
        ) : !account.connected ? (
          <div>
            <p className="muted">No Instagram account connected.</p>
            <button className="btn-primary" onClick={handleConnectInstagram} disabled={connecting}>
              {connecting ? "Redirecting to Instagram…" : "Connect Instagram"}
            </button>
          </div>
        ) : (
          <dl className="kv">
            <dt>Instagram account</dt>
            <dd>{account.instagramAccountId}</dd>
            <dt>Status</dt>
            <dd>
              <span className={account.status === "healthy" ? "pill pill-ok" : "pill pill-error"}>
                {account.status}
              </span>
            </dd>
            {account.status === "error" && (
              <>
                <dt>Last error</dt>
                <dd>{account.lastError}</dd>
              </>
            )}
            <dt>Last checked</dt>
            <dd>{formatDate(account.lastCheckedAt)}</dd>
          </dl>
        )}
      </section>

      <section className="card">
        <h2>Analytics</h2>
        {analytics === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-value">{analytics.commentsReceived}</div>
              <div className="stat-label">Comments received</div>
            </div>
            <div className="stat">
              <div className="stat-value">{analytics.dmsSent}</div>
              <div className="stat-label">DMs sent</div>
            </div>
            <div className="stat">
              <div className="stat-value">{analytics.dmFailures}</div>
              <div className="stat-label">DM failures</div>
            </div>
            <div className="stat">
              <div className="stat-value">{analytics.uniqueLeads}</div>
              <div className="stat-label">Unique leads</div>
            </div>
          </div>
        )}
      </section>

      <CampaignsPanel tenantId={tenantId} />

      <section className="card">
        <h2>Leads</h2>
        {leads === null ? (
          <p className="muted">Loading…</p>
        ) : leads.length === 0 ? (
          <p className="muted">No leads yet — they'll show up here as soon as someone comments on a tracked post.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Last contact</th>
                <th>Via</th>
                <th>Messaging window</th>
                <th>First seen</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.username ?? "(unknown)"}</td>
                  <td>{formatDate(lead.lastInboundAt)}</td>
                  <td>{formatLastContactVia(lead.lastEventType)}</td>
                  <td>
                    {lead.windowOpenUntil && new Date(lead.windowOpenUntil) > new Date() ? (
                      <span className="pill pill-ok">open</span>
                    ) : (
                      <span className="pill">closed</span>
                    )}
                  </td>
                  <td>{formatDate(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <BillingPanel tenantId={tenantId} />
    </div>
  );
}
