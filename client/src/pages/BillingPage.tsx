import { useParams } from "react-router-dom";
import { BillingPanel } from "../components/BillingPanel";

/** Settings → Plan & billing sub-page — matches the sidebar's "Current Plan" card linking here. */
export function BillingPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;

  return (
    <div className="page-billing">
      <BillingPanel tenantId={tenantId} />
    </div>
  );
}
