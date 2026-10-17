import { useTenant } from "../../context/TenantContext";

/**
 * General currently mixes server-backed workspace identity with values that
 * are not tenant settings. Keep the preview's structure, but label those
 * values according to their actual source rather than implying persistence.
 */
export function SettingsGeneralPage() {
  const { tenant } = useTenant();
  const workspaceName = tenant?.name ?? "Loading…";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const defaultOwner = "Unavailable — not exposed by the current API";

  return (
    <section className="card settings-panel">
      <div className="settings-panel-header">
        <div>
          <div className="settings-eyebrow">WORKSPACE DEFAULTS</div>
          <h2>General</h2>
          <p className="muted small">View the basic details and defaults available to this workspace.</p>
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
            <input type="text" value={timezone} readOnly aria-readonly="true" />
            <span className="mt-1 block text-sm text-subtle">Current browser time zone; not a saved workspace setting.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Default lead owner</span>
            <input type="text" value={defaultOwner} readOnly aria-readonly="true" />
            <span className="mt-1 block text-sm text-subtle">The preview shows Unassigned queue and Workspace owner choices, but the current API exposes no saved default owner.</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="button" className="btn-primary" disabled>Save general settings</button>
          <span className="text-sm text-subtle">Read-only until a general workspace-settings update API exists.</span>
        </div>

        <div className="rounded-lg border border-line bg-canvas p-3 text-sm text-subtle" role="note">
          Workspace name is the current server-backed workspace value. The time zone is derived from this browser and is not a saved workspace setting. A workspace default lead owner is not exposed by the current API, so no default is shown as authoritative and no local-only save is offered.
        </div>
      </div>
    </section>
  );
}
