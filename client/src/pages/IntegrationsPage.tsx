import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type AccountHealth } from "../api";
import { CrmMarkIcon, InstagramMarkIcon, WhatsAppMarkIcon } from "../components/icons";

/**
 * Only Instagram is a real, connectable channel today (see server/env.example
 * — no WhatsApp or CRM config exists). WhatsApp and CRM are shown as
 * "Coming soon" rather than as dead connect buttons.
 */
export function IntegrationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<AccountHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    api
      .getAccountHealth(tenantId)
      .then((a) => {
        if (!cancelled) setAccount(a);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load integrations");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate]);

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

  if (!tenantId) return null;

  return (
    <div className="page">
      <h1>Integrations</h1>
      <p className="muted">Channels signalAI can send and receive messages through.</p>

      {error && <div className="banner banner-error">{error}</div>}

      <section className="card flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
            <InstagramMarkIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0">Instagram</h3>
              {account?.connected && account.status !== "error" && (
                <span className="pill pill-ok">
                  <span className="mr-1">●</span>Connected
                </span>
              )}
              {account?.connected && account.status === "error" && <span className="pill pill-error">Needs attention</span>}
            </div>
            <p className="muted small mt-1">
              {account === null
                ? "Checking connection…"
                : account.connected
                  ? `Replying to comments and DMs on ${account.instagramAccountId ?? "your connected account"}.`
                  : "Connect your Instagram Business account to start replying to comments and DMs automatically."}
            </p>
            {account?.connected && account.status === "error" && account.lastError && (
              <p className="banner banner-error mt-2" style={{ marginBottom: 0 }}>
                {account.lastError}
              </p>
            )}
          </div>
        </div>
        {!account?.connected && (
          <button className="btn-primary btn-small shrink-0" onClick={handleConnect} disabled={connecting || account === null}>
            {connecting ? "Redirecting…" : "Connect"}
          </button>
        )}
      </section>

      <section className="card flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
          <WhatsAppMarkIcon className="h-6 w-6" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="m-0">WhatsApp</h3>
            <span className="pill" style={{ marginLeft: 0 }}>
              Coming soon
            </span>
          </div>
          <p className="muted small mt-1">Hand off qualified leads to WhatsApp for your sales team to take over.</p>
        </div>
      </section>

      <section className="card flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
          <CrmMarkIcon className="h-6 w-6" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="m-0">CRM sync</h3>
            <span className="pill" style={{ marginLeft: 0 }}>
              Coming soon
            </span>
          </div>
          <p className="muted small mt-1">Push qualified leads straight into your CRM as they're handed over.</p>
        </div>
      </section>
    </div>
  );
}
