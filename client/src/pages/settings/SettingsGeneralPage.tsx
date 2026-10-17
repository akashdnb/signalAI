import { useTenant } from "../../context/TenantContext";

const TIMEZONE_OPTIONS = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

/**
 * The tenant API currently exposes read-only workspace details. Keep the
 * preview's General structure, but do not present local-only edits as saved
 * product state until a tenant update API exists.
 */
export function SettingsGeneralPage() {
  const { tenant } = useTenant();
  const workspaceName = tenant?.name ?? "Loading…";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const defaultOwner = "first_available";

  return (
    <section className="card settings-panel">
      <div className="settings-panel-header">
        <div>
          <div className="settings-eyebrow">WORKSPACE</div>
          <h2>General</h2>
          <p className="muted small">Set the basic details and defaults for this workspace.</p>
        </div>
      </div>

      <div className="settings-form">
        <div className="settings-form-grid">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Workspace name</span>
            <input type="text" value={workspaceName} readOnly aria-readonly="true" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Time zone</span>
            <select value={timezone} disabled aria-disabled="true">
              {!TIMEZONE_OPTIONS.includes(timezone) && <option value={timezone}>{timezone}</option>}
              {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Default lead owner</span>
            <select value={defaultOwner} disabled aria-disabled="true">
              <option value="first_available">First available teammate</option>
              <option value="unassigned">Leave unassigned</option>
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-line bg-canvas p-3 text-sm text-subtle" role="note">
          Workspace name, time zone, and default lead owner are currently read-only because SignalAI has no tenant-update API for these settings. No local-only save is offered.
        </div>
      </div>
    </section>
  );
}
