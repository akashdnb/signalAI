import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  api,
  clearSession,
  loadSession,
  type AccountHealth,
  type BillingSummary,
  type TenantSummary,
  type UsageSummary,
} from "../api";
import { TenantContext } from "../context/TenantContext";
import { deriveDisplayName } from "../lib/leadFormatting";
import { Logo } from "./Logo";
import { OnboardingWizard } from "./OnboardingWizard";
import { ThemeToggle } from "./ThemeToggle";
import {
  AnalyticsIcon,
  AutomationIcon,
  BellIcon,
  ChevronDownIcon,
  CloseIcon,
  ContentIcon,
  HomeIcon,
  InboxIcon,
  InstagramMarkIcon,
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
                isActive ? "bg-chip text-accent" : "text-ink hover:bg-chip"
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

function PlanCard({ tenantId, billing }: { tenantId: string; billing: BillingSummary | null }) {
  const renewalLine =
    billing?.planTier === "trial" && billing.trialEndsAt
      ? `Trial ends ${new Date(billing.trialEndsAt).toLocaleDateString()}`
      : billing?.billingStatus === "active"
        ? "Active plan"
        : null;

  return (
    <div className="rounded-xl border border-line bg-card p-3 shadow-sm">
      <div className="text-xs font-medium text-subtle">Current Plan</div>
      <div className="mt-0.5 text-base font-semibold text-ink">{billing?.planTierLabel ?? "…"}</div>
      {renewalLine && <div className="mt-0.5 text-xs text-subtle">{renewalLine}</div>}
      <Link
        to={`/dashboard/${tenantId}/settings`}
        className="mt-2.5 block rounded-lg bg-accent px-3 py-1.5 text-center text-sm font-semibold text-white no-underline hover:bg-accent-hover"
      >
        Upgrade
      </Link>
    </div>
  );
}

function AccountHeader({
  tenant,
  account,
  usage,
  email,
  onLogout,
}: {
  tenant: TenantSummary | null;
  account: AccountHealth | null;
  usage: UsageSummary | null;
  email?: string;
  onLogout: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const tokenPct = usage ? Math.min(100, Math.round((usage.tokens.used / Math.max(usage.tokens.allowance, 1)) * 100)) : 0;

  return (
    <header className="hidden h-[76px] items-center justify-between gap-4 border-b border-line bg-card px-6 md:flex">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
          <InstagramMarkIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{tenant?.name ?? "…"}</div>
          {account?.connected ? (
            <span className="pill pill-ok m-0 inline-block">
              <span className="mr-1">●</span>Connected
            </span>
          ) : (
            <span className="text-xs text-subtle">Instagram not connected</span>
          )}
        </div>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-subtle" />
      </div>

      <div className="flex shrink-0 items-center gap-5">
        {usage && (
          <div className="w-40">
            <div className="flex items-center justify-between text-xs text-subtle">
              <span>AI Tokens</span>
              <span>
                {usage.tokens.used >= 1000 ? `${(usage.tokens.used / 1000).toFixed(1)}K` : usage.tokens.used}
                {" / "}
                {usage.tokens.allowance >= 1000 ? `${(usage.tokens.allowance / 1000).toFixed(0)}K` : usage.tokens.allowance}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-chip">
              <div
                className={`h-full rounded-full ${usage.tokens.nearingLimit ? "bg-err-ink" : "bg-accent"}`}
                style={{ width: `${tokenPct}%` }}
              />
            </div>
          </div>
        )}

        <ThemeToggle />

        <button
          type="button"
          aria-label="Notifications"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
        >
          <BellIcon className="h-5 w-5" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-chip"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
              {(email?.charAt(0) ?? "?").toUpperCase()}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-medium text-ink">{deriveDisplayName(email)}</span>
              <span className="block text-xs text-subtle">Owner</span>
            </span>
            <ChevronDownIcon className="h-4 w-4 text-subtle" />
          </button>
          {profileOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setProfileOpen(false)}
              />
              <div className="absolute right-0 top-11 z-20 w-44 rounded-xl border border-line bg-card p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-chip"
                >
                  <LogoutIcon className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Persistent sidebar shell for every authenticated `/dashboard/:tenantId/*`
 * route. Owns what used to be duplicated per-page: the session guard, the
 * tenant fetch (now shared via TenantContext instead of one call per page),
 * and the nav/account/logout chrome.
 */
export function AppShell() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountHealth | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Onboarding wizard (R5): latched open once industry flips from null to
  // set (step 2 of the wizard), so the user stays on step 3 (knowledge
  // base) rather than the wizard vanishing the instant tenant.industry
  // becomes non-null. Only "Finish" (or a page reload, since this is
  // local-only state) ends it — see AppShell/OnboardingWizard's shared
  // doc comment in the R5 plan for why a reload mid-wizard is an accepted
  // simplification rather than a persisted step field.
  const [wizardLatchedOpen, setWizardLatchedOpen] = useState(false);
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

  useEffect(() => {
    if (!sessionValid || !tenantId) return;
    let cancelled = false;
    Promise.all([api.getAccountHealth(tenantId), api.getUsage(tenantId), api.getBilling(tenantId)])
      .then(([a, u, b]) => {
        if (cancelled) return;
        setAccount(a);
        setUsage(u);
        setBilling(b);
      })
      .catch(() => {
        // Header chrome degrades gracefully — a failed fetch just leaves these panels blank, it's not a page-blocking error.
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, sessionValid]);

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  if (!tenantId || !sessionValid) return null;

  const showWizard = Boolean(tenant) && (tenant!.industry === null || wizardLatchedOpen);

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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sidebar transition-transform duration-200 md:static md:z-auto md:w-[212px] md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Logo size="md" />
          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              aria-label="Close menu"
              className="text-subtle"
              onClick={() => setMobileNavOpen(false)}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <NavList items={PRIMARY_NAV} tenantId={tenantId} onNavigate={() => setMobileNavOpen(false)} />
          <div className="my-4 border-t border-line" />
          <NavList items={SECONDARY_NAV} tenantId={tenantId} onNavigate={() => setMobileNavOpen(false)} />
        </nav>

        <div className="border-t border-line p-3">
          <PlanCard tenantId={tenantId} billing={billing} />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-card px-4 py-3 md:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}>
            <MenuIcon className="h-6 w-6" />
          </button>
          <Logo size="sm" className="flex-1" />
          <ThemeToggle />
        </header>

        <AccountHeader tenant={tenant} account={account} usage={usage} email={session?.email} onLogout={handleLogout} />

        <main className="flex-1 overflow-y-auto">
          {tenantError && (
            <div className="page">
              <div className="banner banner-error">{tenantError}</div>
            </div>
          )}
          <TenantContext.Provider value={{ tenant, error: tenantError, reload: reloadTenant }}>
            {showWizard ? (
              <OnboardingWizard
                tenantId={tenantId}
                onIndustryApplied={(updated) => {
                  setTenant(updated);
                  setWizardLatchedOpen(true);
                }}
                onFinish={() => setWizardLatchedOpen(false)}
              />
            ) : (
              <Outlet />
            )}
          </TenantContext.Provider>
        </main>
      </div>
    </div>
  );
}
