import { useParams } from "react-router-dom";
import { BillingPanel } from "../components/BillingPanel";

/** Split out of Settings (R8 nav rework) — its own bottom-utility nav destination, matching the sidebar's "Current Plan" card linking here. */
export function BillingPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;

  return (
    <div className="page">
      <h1>Billing</h1>
      <BillingPanel tenantId={tenantId} />
    </div>
  );
}
