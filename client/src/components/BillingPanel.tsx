import { useEffect, useState } from "react";
import { api, type BillingSummary, type PlanTier, type UsageSummary } from "../api";
import { ErrorState, LoadingState, Section, StatusBadge } from "./ui";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return null;
  return Math.ceil((value - Date.now()) / (24 * 60 * 60 * 1000));
}

function usagePercent(used: number, allowance: number): number {
  if (allowance <= 0) return used > 0 ? 100 : 0;
  return Math.max(0, Math.round((used / allowance) * 100));
}

function UsageMeter({
  title,
  unit,
  used,
  allowance,
  nearingLimit,
}: {
  title: string;
  unit: string;
  used: number;
  allowance: number;
  nearingLimit: boolean;
}) {
  const percent = usagePercent(used, allowance);
  const fill = Math.min(100, percent);
  return (
    <div className="billing-usage-meter">
      <div className="billing-usage-meter-heading">
        <div className="min-w-0">
          <h3>{title}</h3>
          <p>{used.toLocaleString()} of {allowance.toLocaleString()} {unit}</p>
        </div>
        <strong className="billing-usage-percent">{percent}%</strong>
      </div>
      <div
        className="billing-usage-track"
        role="progressbar"
        aria-label={`${title} allowance used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fill}
        aria-valuetext={`${used.toLocaleString()} of ${allowance.toLocaleString()} ${unit}`}
      >
        <span style={{ width: `${fill}%` }} />
      </div>
      <div className="billing-usage-meter-footer">
        <span>{allowance > 0 ? "Usage this cycle" : "Allowance not configured"}</span>
        {percent >= 100 ? (
          <StatusBadge tone="danger" dot>Limit reached</StatusBadge>
        ) : nearingLimit ? (
          <StatusBadge tone="warning" dot>Near limit</StatusBadge>
        ) : null}
      </div>
    </div>
  );
}

function subscriptionLabel(billing: BillingSummary): string {
  if (billing.billingStatus === "active") return "Subscription active";
  if (billing.billingStatus === "canceled") return "Subscription canceled";
  return "No paid subscription";
}

export function BillingPanel({ tenantId }: { tenantId: string }) {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingTier, setStartingTier] = useState<PlanTier | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([api.getBilling(tenantId), api.getUsage(tenantId)])
      .then(([nextBilling, nextUsage]) => {
        if (cancelled) return;
        setBilling(nextBilling);
        setUsage(nextUsage);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load billing status");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadCount]);

  async function handleUpgrade(tier: PlanTier) {
    setStartingTier(tier);
    setError(null);
    try {
      const { url } = await api.startCheckout(tenantId, tier);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setStartingTier(null);
    }
  }

  const trialDaysLeft = billing?.planTier === "trial" ? daysUntil(billing.trialEndsAt) : null;
  const showTrialCountdown = trialDaysLeft !== null && trialDaysLeft <= 3;
  const statusTone = billing?.billingStatus === "active"
    ? "success"
    : billing?.billingStatus === "canceled"
      ? "warning"
      : "neutral";

  return (
    <div className="billing-panel">
      {error && billing !== null && <div className="banner banner-error" role="alert">{error}</div>}

      {billing === null ? (
        error ? (
          <ErrorState
            title="Couldn't load plan and usage"
            description={error}
            action={<button type="button" className="btn-secondary btn-small" onClick={() => setReloadCount((count) => count + 1)}>Retry</button>}
          />
        ) : (
          <LoadingState
            label="Loading plan and usage"
            description="Checking the billing status and current workspace allowances."
          />
        )
      ) : (
        <>
          <Section
            title="Current plan"
            description="The plan and subscription state returned by SignalAI for this workspace."
            className="billing-plan-section"
            divided
          >
            <div className="billing-plan-summary">
              <div className="min-w-0">
                <p className="billing-section-eyebrow">Workspace plan</p>
                <h3 className="billing-plan-name">{billing.planTierLabel}</h3>
                <p className="muted m-0 text-sm">{subscriptionLabel(billing)}</p>
              </div>
              <StatusBadge tone={statusTone} dot>{subscriptionLabel(billing)}</StatusBadge>
            </div>

            {billing.planTier === "trial" && billing.trialEndsAt && (
              <p className="billing-trial-note muted text-sm">
                Trial ends {formatDate(billing.trialEndsAt)}.
                {showTrialCountdown && (
                  <StatusBadge tone={trialDaysLeft! <= 0 ? "danger" : "warning"} dot className="ml-2">
                    {trialDaysLeft! <= 0 ? "Trial ended" : `${trialDaysLeft} days left`}
                  </StatusBadge>
                )}
              </p>
            )}
          </Section>

          {usage && (
            <Section
              title="Usage this cycle"
              description="Usage totals and allowances are returned by the production API; the progress bars are capped visually at 100%."
              className="billing-usage-section"
              divided
            >
              <div className="billing-usage-grid">
                <UsageMeter
                  title="AI tokens"
                  unit="tokens"
                  used={usage.tokens.used}
                  allowance={usage.tokens.allowance}
                  nearingLimit={usage.tokens.nearingLimit}
                />
                <UsageMeter
                  title="Direct messages"
                  unit="messages"
                  used={usage.dms.sent}
                  allowance={usage.dms.allowance}
                  nearingLimit={usage.dms.nearingLimit}
                />
              </div>

              {usage.tokens.overage > 0 && (
                <div className="billing-overage-note mt-4" role="note">
                  <div>
                    <strong>Estimated token overage</strong>
                    <p className="muted m-0 mt-1 text-sm">{usage.tokens.overage.toLocaleString()} tokens above the current allowance.</p>
                  </div>
                  <strong className="billing-overage-price">${usage.tokens.estimatedOverageCostUsd.toFixed(2)}</strong>
                </div>
              )}
            </Section>
          )}

          {usage && !usage.isEntitled && (
            <div className="banner banner-error billing-entitlement-notice" role="alert">
              {billing.billingConfigured
                ? "Your trial has ended. Choose a paid plan below to keep campaigns running."
                : "Your current usage allowance has been exhausted. Paid billing is not enabled yet, so no upgrade or checkout action is available in this beta workspace."}
            </div>
          )}

          {!billing.billingConfigured ? (
            <div className="billing-payment-notice" role="note">
              <div>
                <h3>Payments are not enabled yet</h3>
                <p className="muted m-0 mt-1 text-sm leading-6">
                  This beta workspace is not connected to a payment provider, so no charge will be created from this screen. Your current usage allowance still applies. Plan options and checkout will appear here when paid billing is enabled.
                </p>
              </div>
            </div>
          ) : billing.billingStatus !== "active" && billing.availableTiers.length > 0 ? (
            <Section title="Choose a plan" description="Select a plan to continue to the configured checkout provider.">
              <div className="flex flex-wrap gap-2">
                {billing.availableTiers.map((tier) => (
                  <button
                    key={tier.tier}
                    type="button"
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
            </Section>
          ) : null}

          <p className="muted billing-reset-note">
            Usage resets with the current billing cycle. The allowance shown here is the limit SignalAI applies to this workspace.
          </p>
        </>
      )}
    </div>
  );
}
