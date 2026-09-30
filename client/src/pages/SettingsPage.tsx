import { useParams } from "react-router-dom";
import { FieldDefinitionsPanel } from "../components/FieldDefinitionsPanel";
import { GuardrailsConfigPanel } from "../components/GuardrailsConfigPanel";
import { useTenant } from "../context/TenantContext";

/** Knowledge Base and Billing moved to their own nav destinations (R8) — this page is now tenant-wide config only: captured-fact schema and AI guardrails. */
export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenant } = useTenant();

  if (!tenantId) return null;

  return (
    <div className="page">
      <h1>{tenant?.name ?? "Settings"}</h1>

      <FieldDefinitionsPanel tenantId={tenantId} />
      <GuardrailsConfigPanel tenantId={tenantId} />
    </div>
  );
}
