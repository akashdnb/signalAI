import { NavLink, Outlet, useParams } from "react-router-dom";

interface SettingsNavItem {
  to: string;
  label: string;
}

const WORKSPACE_ITEMS: SettingsNavItem[] = [
  { to: "general", label: "General" },
  { to: "team", label: "Team & access" },
  { to: "billing", label: "Plan & billing" },
  { to: "fields", label: "Lead fields" },
  { to: "ai-behavior", label: "AI behavior" },
  { to: "forbidden-topics", label: "Forbidden topics" },
  { to: "escalation", label: "Escalation" },
  { to: "scoring", label: "Scoring" },
];

const PERSONAL_ITEMS: SettingsNavItem[] = [
  { to: "appearance", label: "Appearance" },
  { to: "profile", label: "Profile" },
  { to: "notifications", label: "Notifications" },
];

function SettingsNavList({ items }: { items: SettingsNavItem[] }) {
  return (
    <ul className="list-none space-y-0.5 p-0">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors ${
                isActive ? "bg-chip text-accent" : "text-ink hover:bg-chip"
              }`
            }
          >
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * Settings' left sub-nav (Workspace config + Personal preferences), matching
 * the preview's literal IA. Team & access and Plan & billing render here
 * instead of as separate top-level sidebar routes — see AppShell's
 * SECONDARY_NAV — though their old top-level URLs still redirect here (App.tsx)
 * so existing bookmarks/links keep working.
 */
export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;

  return (
    <div className="page page-wide">
      <h1>Settings</h1>
      <p className="muted">Manage appearance, workspace access, plan and usage, and automation behavior.</p>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="shrink-0 lg:w-56">
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">Workspace</div>
          <SettingsNavList items={WORKSPACE_ITEMS} />
          <div className="my-3 border-t border-line" />
          <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">Personal</div>
          <SettingsNavList items={PERSONAL_ITEMS} />
        </aside>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
