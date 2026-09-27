import { useEffect, useState } from "react";
import { api, type BillingSummary, type PlanTier, type UsageSummary } from "../api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function BillingPanel({ tenantId }: { tenantId: string }) {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingTier, setStartingTier] = useState<PlanTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getBilling(tenantId), api.getUsage(tenantId)])
      .then(([b, u]) => {
        if (cancelled) return;
        setBilling(b);
        setUsage(u);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load billing status");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleUpgrade(tier: PlanTier) {
    setStartingTier(tier);
    setError(null);
    try {
      const { url } = await api.startCheckout(tenantId, tier);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setStartingTier(null);
    }
  }

  const trialDaysLeft = billing?.planTier === "trial" ? daysUntil(billing.trialEndsAt) : null;
  const showTrialCountdown = trialDaysLeft !== null && trialDaysLeft <= 3;

  return (
    <section className="card">
      <h2>Billing</h2>
      {error && <div className="banner banner-error">{error}</div>}
      {billing === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p>
            <span className={billing.billingStatus === "active" ? "pill pill-ok" : "pill"}>
              {billing.planTierLabel}
            </span>
            {billing.billingStatus === "active" && " Your subscription is active — thanks for being a pilot creator!"}
            {billing.planTier === "trial" && billing.trialEndsAt && (
              <>
                {" "}
                Trial ends {formatDate(billing.trialEndsAt)}
                {showTrialCountdown && (
                  <span className="pill pill-error">{trialDaysLeft! <= 0 ? "expired" : `${trialDaysLeft}d left`}</span>
                )}
              </>
            )}
            {billing.billingStatus === "canceled" && " Your subscription was canceled."}
          </p>

          {usage && (
            <div className="stat-grid">
              <div className="stat">
                <div className="stat-value">
                  {usage.tokens.used.toLocaleString()}
                  {usage.tokens.nearingLimit && <span className="pill pill-error">near limit</span>}
                </div>
                <div className="stat-label">Tokens used / {usage.tokens.allowance.toLocaleString()}</div>
              </div>
              <div className="stat">
                <div className="stat-value">
                  {usage.dms.sent.toLocaleString()}
                  {usage.dms.nearingLimit && <span className="pill pill-error">near limit</span>}
                </div>
                <div className="stat-label">DMs sent / {usage.dms.allowance.toLocaleString()}</div>
              </div>
              {usage.tokens.overage > 0 && (
                <div className="stat">
                  <div className="stat-value">${usage.tokens.estimatedOverageCostUsd.toFixed(2)}</div>
                  <div className="stat-label">Est. overage ({usage.tokens.overage.toLocaleString()} tokens)</div>
                </div>
              )}
            </div>
          )}
          {usage && !usage.isEntitled && (
            <div className="banner banner-error">
              Your trial has ended. Upgrade below to keep campaigns running.
            </div>
          )}

          {!billing.billingConfigured ? (
            <p className="muted">Billing isn't set up yet on this server. Check back soon.</p>
          ) : billing.billingStatus !== "active" && billing.availableTiers.length > 0 ? (
            <>
              <h3 style={{ marginTop: "1.25rem" }}>Upgrade</h3>
              <div className="button-row">
                {billing.availableTiers.map((tier) => (
                  <button
                    key={tier.tier}
                    className="btn-primary btn-small"
                    onClick={() => handleUpgrade(tier.tier)}
                    disabled={startingTier !== null}
                  >
                    {startingTier === tier.tier
                      ? "Redirecting…"
                      : `${tier.label} — ${tier.dmsPerMonth.toLocaleString()} DMs/mo`}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
