import { useParams } from "react-router-dom";
import { BillingPanel } from "../components/BillingPanel";
import { PageHeader } from "../components/ui";

/** Split out of Settings (R8 nav rework) — its own bottom-utility nav destination, matching the sidebar's "Current Plan" card linking here. */
export function BillingPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;

  return (
    <div className="page page-wide page-billing">
      <PageHeader
        eyebrow="Workspace"
        title="Plan & billing"
        description="Review your plan, current usage allowance, and whether paid checkout is enabled for this workspace."
      />
      <BillingPanel tenantId={tenantId} />
    </div>
  );
}
