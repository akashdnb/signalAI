import { useEffect, useState } from "react";
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
 * Visual shell matching the preview's General section — there's no
 * tenant-update API yet (`grep -n "updateTenant" client/src/api.ts` finds no
 * match), so inputs are locally interactive but Save doesn't persist.
 * Honest about that below the button rather than hiding the section.
 */
export function SettingsGeneralPage() {
  const { tenant } = useTenant();
  const [workspaceName, setWorkspaceName] = useState(tenant?.name ?? "");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [defaultOwner, setDefaultOwner] = useState("first_available");

  // TenantContext fetches asynchronously, so `tenant` is often still null on
  // first render — sync once it arrives instead of leaving the field blank.
  useEffect(() => {
    if (tenant?.name) setWorkspaceName(tenant.name);
  }, [tenant?.name]);

  return (
    <section className="card">
      <h2>General</h2>
      <p className="muted small">Set the basic details and defaults for this workspace.</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Workspace name</span>
          <input type="text" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Time zone</span>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {!TIMEZONE_OPTIONS.includes(timezone) && <option value={timezone}>{timezone}</option>}
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Default lead owner</span>
          <select value={defaultOwner} onChange={(e) => setDefaultOwner(e.target.value)}>
            <option value="first_available">First available teammate</option>
            <option value="unassigned">Leave unassigned</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary btn-small">
          Save general settings
        </button>
        <span className="muted small">Workspace settings can&rsquo;t be saved yet — there&rsquo;s no update API for this.</span>
      </div>
    </section>
  );
}
