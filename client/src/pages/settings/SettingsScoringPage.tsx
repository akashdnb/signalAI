import { useParams } from "react-router-dom";
import { ScoringRulesPanel } from "../../components/ScoringRulesPanel";

export function SettingsScoringPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;
  return <ScoringRulesPanel tenantId={tenantId} />;
}
