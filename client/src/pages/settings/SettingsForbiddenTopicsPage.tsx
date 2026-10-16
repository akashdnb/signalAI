import { useParams } from "react-router-dom";
import { GuardrailsConfigPanel } from "../../components/GuardrailsConfigPanel";

export function SettingsForbiddenTopicsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;
  return <GuardrailsConfigPanel tenantId={tenantId} section="forbidden-topics" />;
}
