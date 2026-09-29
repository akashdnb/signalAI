import { useEffect, useState, type ComponentType } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, clearSession, loadSession, type TenantSummary } from "../api";
import { TenantContext } from "../context/TenantContext";
import {
  AnalyticsIcon,
  AutomationIcon,
  CloseIcon,
  ContentIcon,
  HomeIcon,
  InboxIcon,
  IntegrationsIcon,
  LeadsIcon,
  LogoutIcon,
  MenuIcon,
  SettingsIcon,
  TeamIcon,
} from "./icons";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "", label: "Home", icon: HomeIcon, end: true },
  { to: "inbox", label: "Inbox", icon: InboxIcon },
  { to: "leads", label: "Leads", icon: LeadsIcon },
  { to: "automation", label: "Automation", icon: AutomationIcon },
  { to: "content", label: "Content", icon: ContentIcon },
  { to: "analytics", label: "Analytics", icon: AnalyticsIcon },
  { to: "team", label: "Team", icon: TeamIcon },
];

const SECONDARY_NAV: NavItem[] = [
  { to: "integrations", label: "Integrations", icon: IntegrationsIcon },
  { to: "settings", label: "Settings", icon: SettingsIcon },
];

function NavList({ items, tenantId, onNavigate }: { items: NavItem[]; tenantId: string; onNavigate: () => void }) {
  return (
    <ul className="list-none space-y-1 p-0">
      {items.map((item) => (
        <li key={item.label}>
          <NavLink
            to={`/dashboard/${tenantId}/${item.to}`}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors ${
                isActive ? "bg-accent text-white" : "text-ink hover:bg-chip"
              }`
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * Persistent sidebar shell for every authenticated `/dashboard/:tenantId/*`
 * route. Owns what used to be duplicated per-page: the session guard, the
 * tenant fetch (now shared via TenantContext instead of one call per page),
 * and the nav/logout chrome.
 */
export function AppShell() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const session = loadSession();
  const sessionValid = Boolean(tenantId && session && session.tenantId === tenantId);

  useEffect(() => {
    if (!sessionValid) {
      navigate("/login", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionValid]);

  async function reloadTenant() {
    if (!tenantId) return;
    try {
      const t = await api.getTenant(tenantId);
      setTenant(t);
      setTenantError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate("/login", { replace: true });
        return;
      }
      setTenantError(err instanceof Error ? err.message : "Failed to load tenant");
    }
  }

  useEffect(() => {
    if (sessionValid) reloadTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, sessionValid]);

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  if (!tenantId || !sessionValid) return null;

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sidebar transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <span className="text-lg font-bold text-accent">signalAI</span>
          <button
            type="button"
            aria-label="Close menu"
            className="text-subtle md:hidden"
            onClick={() => setMobileNavOpen(false)}
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <NavList items={PRIMARY_NAV} tenantId={tenantId} onNavigate={() => setMobileNavOpen(false)} />
          <div className="my-4 border-t border-line" />
          <NavList items={SECONDARY_NAV} tenantId={tenantId} onNavigate={() => setMobileNavOpen(false)} />
        </nav>

        <div className="border-t border-line px-5 py-4">
          <div className="truncate text-sm font-medium text-ink">{tenant?.name ?? "…"}</div>
          {session?.email && <div className="truncate text-xs text-subtle">{session.email}</div>}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 flex items-center gap-2 text-sm text-subtle hover:text-ink"
          >
            <LogoutIcon className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-card px-4 py-3 md:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}>
            <MenuIcon className="h-6 w-6" />
          </button>
          <span className="text-base font-semibold text-accent">signalAI</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          {tenantError && (
            <div className="page">
              <div className="banner banner-error">{tenantError}</div>
            </div>
          )}
          <TenantContext.Provider value={{ tenant, error: tenantError, reload: reloadTenant }}>
            <Outlet />
          </TenantContext.Provider>
        </main>
      </div>
    </div>
  );
}
