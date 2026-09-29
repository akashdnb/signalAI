import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, type AccountHealth, type Analytics, type LeadListItem } from "../api";
import { CampaignsPanel } from "../components/CampaignsPanel";
import { useTenant } from "../context/TenantContext";
import { PIPELINE_STAGES, formatDate, formatLastContactVia } from "../lib/leadFormatting";

export function DashboardPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenant } = useTenant();

  const [account, setAccount] = useState<AccountHealth | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recentLeads, setRecentLeads] = useState<LeadListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const justConnected = searchParams.get("connected") === "1";

  useEffect(() => {
    // AppShell already guards the session before this page ever mounts —
    // this effect only needs to load the page's own data. A 401/403 mid-
    // session (expired/revoked token) is still handled below per call.
    if (!tenantId) return;

    let cancelled = false;
    async function load() {
      try {
        const [a, an, leads] = await Promise.all([
          api.getAccountHealth(tenantId!),
          api.getAnalytics(tenantId!),
          api.getLeads(tenantId!),
        ]);
        if (cancelled) return;
        setAccount(a);
        setAnalytics(an);
        setRecentLeads(leads.slice(0, 5));
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
      <h1>{tenant?.name ?? "Your dashboard"}</h1>

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
        <div className="dashboard-header" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: 0 }}>Analytics</h2>
          <Link to={`/dashboard/${tenantId}/analytics`}>View full analytics →</Link>
        </div>
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
        <div className="dashboard-header" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: 0 }}>Recent Leads</h2>
          <Link to={`/dashboard/${tenantId}/leads`}>View all leads →</Link>
        </div>
        {recentLeads === null ? (
          <p className="muted">Loading…</p>
        ) : recentLeads.length === 0 ? (
          <p className="muted">No leads yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Stage</th>
                <th>Last contact</th>
                <th>Via</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link to={`/dashboard/${tenantId}/leads/${lead.id}`}>{lead.username ?? "(unknown)"}</Link>
                  </td>
                  <td>{PIPELINE_STAGES.find((s) => s.value === lead.pipelineStage)?.label ?? lead.pipelineStage}</td>
                  <td>{formatDate(lead.lastInboundAt)}</td>
                  <td>{formatLastContactVia(lead.lastEventType)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

    </div>
  );
}
