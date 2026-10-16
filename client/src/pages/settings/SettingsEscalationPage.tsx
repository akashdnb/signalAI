import { useParams } from "react-router-dom";
import { GuardrailsConfigPanel } from "../../components/GuardrailsConfigPanel";

export function SettingsEscalationPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;
  return <GuardrailsConfigPanel tenantId={tenantId} section="escalation" />;
}
