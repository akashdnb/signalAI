import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, clearSession, loadSession, type AccountHealth, type Analytics, type LeadListItem, type TenantSummary } from "../api";
import { CampaignsPanel } from "../components/CampaignsPanel";
import { BillingPanel } from "../components/BillingPanel";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function DashboardPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [account, setAccount] = useState<AccountHealth | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [leads, setLeads] = useState<LeadListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!tenantId || !session || session.tenantId !== tenantId) {
      navigate("/connect", { replace: true });
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate]);

  function handleLogout() {
    clearSession();
    navigate("/connect", { replace: true });
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

      <section className="card">
        <h2>Account Health</h2>
        {account === null ? (
          <p className="muted">Loading…</p>
        ) : !account.connected ? (
          <p className="muted">No Instagram account connected.</p>
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
                <th>Messaging window</th>
                <th>First seen</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.username ?? "(unknown)"}</td>
                  <td>{formatDate(lead.lastInboundAt)}</td>
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
