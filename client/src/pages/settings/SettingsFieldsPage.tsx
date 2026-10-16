import { useParams } from "react-router-dom";
import { FieldDefinitionsPanel } from "../../components/FieldDefinitionsPanel";

export function SettingsFieldsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;
  return <FieldDefinitionsPanel tenantId={tenantId} />;
}
