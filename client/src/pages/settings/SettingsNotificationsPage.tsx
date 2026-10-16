import { useState } from "react";

interface NotificationPref {
  key: string;
  label: string;
  description: string;
  defaultOn: boolean;
}

const PREFS: NotificationPref[] = [
  { key: "automation_failures", label: "Automation failures", description: "When a journey fails or needs attention", defaultOn: true },
  { key: "human_handoffs", label: "Human handoffs", description: "When a conversation is handed to a teammate", defaultOn: true },
  { key: "new_qualified_leads", label: "New qualified leads", description: "When a lead reaches your qualification goal", defaultOn: false },
  { key: "weekly_summary", label: "Weekly summary", description: "A weekly overview of lead and automation activity", defaultOn: true },
];

/**
 * Visual shell matching the preview's Notifications section — consistent
 * with the header bell, which is already disabled ("Notifications are not
 * available yet") because there's no real notification event system.
 * Toggles are local-only.
 */
export function SettingsNotificationsPage() {
  const [prefs, setPrefs] = useState(() => Object.fromEntries(PREFS.map((p) => [p.key, p.defaultOn])) as Record<string, boolean>);

  return (
    <section className="card">
      <h2>Notifications</h2>
      <p className="muted small">Choose which updates are important enough to bring to your attention.</p>

      <ul className="list mt-4">
        {PREFS.map((pref) => (
          <li key={pref.key} className="list-item">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{pref.label}</span>
              <span className="block text-sm text-subtle">{pref.description}</span>
            </span>
            <input
              type="checkbox"
              aria-label={pref.label}
              checked={prefs[pref.key]}
              onChange={(e) => setPrefs((prev) => ({ ...prev, [pref.key]: e.target.checked }))}
              className="h-5 w-5 shrink-0 accent-accent"
            />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary btn-small">
          Save notification preferences
        </button>
        <span className="muted small">This workspace doesn&rsquo;t send notifications yet — preferences aren&rsquo;t saved.</span>
      </div>
    </section>
  );
}
