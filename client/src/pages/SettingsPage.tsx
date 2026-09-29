import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, loadSession, type TenantSummary } from "../api";
import { FieldDefinitionsPanel } from "../components/FieldDefinitionsPanel";
import { KnowledgeBasePanel } from "../components/KnowledgeBasePanel";
import { GuardrailsConfigPanel } from "../components/GuardrailsConfigPanel";
import { BillingPanel } from "../components/BillingPanel";

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!tenantId || !session || session.tenantId !== tenantId) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const t = await api.getTenant(tenantId!);
        if (cancelled) return;
        setTenant(t);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          navigate("/login", { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load settings");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, navigate]);

  if (!tenantId) return null;

  return (
    <div className="page">
      <header className="dashboard-header">
        <div>
          <h1>{tenant?.name ?? "Settings"}</h1>
          <p className="muted small">Tenant ID: {tenantId}</p>
        </div>
        <Link to={`/dashboard/${tenantId}`}>Back to dashboard</Link>
      </header>

      {error && <div className="banner banner-error">{error}</div>}

      <FieldDefinitionsPanel tenantId={tenantId} />
      <KnowledgeBasePanel tenantId={tenantId} />
      <GuardrailsConfigPanel tenantId={tenantId} />
      <BillingPanel tenantId={tenantId} />
    </div>
  );
}
