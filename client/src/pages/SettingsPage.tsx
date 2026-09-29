import { useParams } from "react-router-dom";
import { FieldDefinitionsPanel } from "../components/FieldDefinitionsPanel";
import { KnowledgeBasePanel } from "../components/KnowledgeBasePanel";
import { GuardrailsConfigPanel } from "../components/GuardrailsConfigPanel";
import { BillingPanel } from "../components/BillingPanel";
import { useTenant } from "../context/TenantContext";

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenant } = useTenant();

  if (!tenantId) return null;

  return (
    <div className="page">
      <h1>{tenant?.name ?? "Settings"}</h1>

      <FieldDefinitionsPanel tenantId={tenantId} />
      <KnowledgeBasePanel tenantId={tenantId} />
      <GuardrailsConfigPanel tenantId={tenantId} />
      <BillingPanel tenantId={tenantId} />
    </div>
  );
}
