import { useParams } from "react-router-dom";
import { CampaignsPanel } from "../components/CampaignsPanel";

/** Moved off the Dashboard (R6): campaign/reply-rule authoring belongs under its own nav item, not the home overview. */
export function AutomationPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;

  return (
    <div className="page">
      <h1>Automation</h1>
      <p className="muted">Reply automatically to comments and DMs that match a campaign's keywords.</p>
      <CampaignsPanel tenantId={tenantId} />
    </div>
  );
}
