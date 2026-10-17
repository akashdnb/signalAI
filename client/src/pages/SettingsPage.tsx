import { NavLink, Outlet, useParams } from "react-router-dom";
import { PageHeader } from "../components/ui";
import "../styles/knowledge-settings-parity.css";

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
    <ul className="settings-nav-list">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            className={({ isActive }) => `settings-nav-link${isActive ? " is-active" : ""}`}
          >
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** Settings sub-nav keeps workspace and personal controls in the same IA as the preview. */
export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;

  return (
    <div className="page page-wide settings-page">
      <PageHeader
        title="Settings"
        description="Manage appearance, workspace access, plan and usage, and automation behavior."
      />

      <div className="settings-layout">
        <aside className="settings-nav" aria-label="Settings sections">
          <div className="settings-nav-group-label">Workspace</div>
          <SettingsNavList items={WORKSPACE_ITEMS} />
          <div className="settings-nav-divider" />
          <div className="settings-nav-group-label">Personal</div>
          <SettingsNavList items={PERSONAL_ITEMS} />
        </aside>

        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
