import { useEffect, useState } from "react";
import { api } from "../api";

export function BillingPanel({ tenantId }: { tenantId: string }) {
  const [status, setStatus] = useState<"none" | "active" | "canceled" | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getBilling(tenantId)
      .then((res) => {
        if (cancelled) return;
        setStatus(res.billingStatus);
        setConfigured(res.billingConfigured);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load billing status");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function handleUpgrade() {
    setStarting(true);
    setError(null);
    try {
      const { url } = await api.startCheckout(tenantId);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setStarting(false);
    }
  }

  return (
    <section className="card">
      <h2>Billing</h2>
      {error && <div className="banner banner-error">{error}</div>}
      {status === null ? (
        <p className="muted">Loading…</p>
      ) : status === "active" ? (
        <p>
          <span className="pill pill-ok">active</span> Your subscription is active — thanks for being a pilot
          creator!
        </p>
      ) : !configured ? (
        <p className="muted">Billing isn't set up yet on this server. Check back soon.</p>
      ) : (
        <>
          <p className="muted">
            {status === "canceled" ? "Your subscription was canceled." : "You're not on a paid plan yet."} One flat
            price, no usage surprises.
          </p>
          <button className="btn-primary" onClick={handleUpgrade} disabled={starting}>
            {starting ? "Redirecting…" : "Upgrade"}
          </button>
        </>
      )}
    </section>
  );
}
