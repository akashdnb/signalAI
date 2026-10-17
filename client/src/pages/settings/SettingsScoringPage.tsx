import { useParams } from "react-router-dom";
import { ScoringRulesPanel } from "../../components/ScoringRulesPanel";
import "../../styles/settings-scoring-parity.css";

export function SettingsScoringPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;
  return (
    <div className="scoring-rules-panel">
      <ScoringRulesPanel tenantId={tenantId} />
    </div>
  );
}
