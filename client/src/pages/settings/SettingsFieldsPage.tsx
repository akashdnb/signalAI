import { useParams } from "react-router-dom";
import { FieldDefinitionsPanel } from "../../components/FieldDefinitionsPanel";
import "../../styles/settings-fields-parity.css";

export function SettingsFieldsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;
  return <FieldDefinitionsPanel tenantId={tenantId} />;
}
