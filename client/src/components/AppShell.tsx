import { useEffect, useRef, useState, type ComponentType } from "react";
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
import { BottomSheet } from "./BottomSheet";
import { TenantContext } from "../context/TenantContext";
import { deriveDisplayName } from "../lib/leadFormatting";
import { Logo } from "./Logo";
import { OnboardingWizard } from "./OnboardingWizard";
import { ThemeToggle } from "./ThemeToggle";
import {
  AnalyticsIcon,
  AutomationIcon,
  BellIcon,
  BookIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CloseIcon,
  ContentIcon,
  CreditCardIcon,
  HomeIcon,
  InboxIcon,
  InstagramMarkIcon,
  IntegrationsIcon,
  LeadsIcon,
  LogoutIcon,
  MenuIcon,
  PanelToggleIcon,
  SettingsIcon,
  SidebarExpandIcon,
} from "./icons";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  /** No real page behind this yet — shown so the product's information architecture stays visible, per explicit product direction, rather than silently disappearing. */
  disabled?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "", label: "Overview", icon: HomeIcon, end: true },
  { to: "inbox", label: "Inbox", icon: InboxIcon },
  { to: "leads", label: "Leads", icon: LeadsIcon },
  { to: "automation", label: "Automation", icon: AutomationIcon },
  { to: "knowledge", label: "Knowledge", icon: BookIcon },
  { to: "content", label: "Content", icon: ContentIcon },
  { to: "analytics", label: "Analytics", icon: AnalyticsIcon },
];

/** Team & access and Plan & billing live inside Settings' own sub-nav now, matching the preview's IA — not separate top-level routes here. */
const SECONDARY_NAV: NavItem[] = [
  { to: "integrations", label: "Integrations", icon: IntegrationsIcon },
  { to: "settings", label: "Settings", icon: SettingsIcon },
];

function NavList({
  items,
  tenantId,
  onNavigate,
  badges,
  collapsed = false,
}: {
  items: NavItem[];
  tenantId: string;
  onNavigate: () => void;
  badges?: Record<string, number>;
  /** Icon-only desktop rail: labels move to `title`/`aria-label` instead of disappearing, so the item stays identifiable on hover/focus and to assistive tech. Never applied on the mobile drawer, which always shows labels. */
  collapsed?: boolean;
}) {
  return (
    <ul className="list-none space-y-1 p-0">
      {items.map((item) =>
        item.disabled ? (
          <li key={item.label}>
            <span
              className={`flex max-md:min-h-11 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-subtle opacity-60 ${collapsed ? "md:justify-center" : ""}`}
              title="Coming soon"
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
              {!collapsed && (
                <span className="ml-auto rounded-full bg-chip px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                  Soon
                </span>
              )}
            </span>
          </li>
        ) : (
          <li key={item.label}>
            <NavLink
              to={`/dashboard/${tenantId}/${item.to}`}
              end={item.end}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `relative flex max-md:min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors ${
                  collapsed ? "md:justify-center" : ""
                } ${isActive ? "bg-chip text-accent" : "text-ink hover:bg-chip"}`
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
              {Boolean(badges?.[item.to]) && (
                <span
                  className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-err-ink px-1.5 text-[11px] font-semibold text-white ${
                    collapsed ? "md:absolute md:right-1 md:top-1 md:h-2.5 md:min-w-2.5 md:p-0 md:text-[0px]" : "ml-auto"
                  }`}
                >
                  {badges![item.to]! > 99 ? "99+" : badges![item.to]}
                </span>
              )}
            </NavLink>
          </li>
        ),
      )}
    </ul>
  );
}

function PlanCard({
  tenantId,
  billing,
  collapsed = false,
}: {
  tenantId: string;
  billing: BillingSummary | null;
  collapsed?: boolean;
}) {
  const renewalLine =
    billing?.planTier === "trial" && billing.trialEndsAt
      ? `Trial ends ${new Date(billing.trialEndsAt).toLocaleDateString()}`
      : billing?.billingStatus === "active"
        ? "Active plan"
        : null;

  if (collapsed) {
    return (
      <Link
        to={`/dashboard/${tenantId}/settings/billing`}
        title={`Current plan: ${billing?.planTierLabel ?? "…"} — View plan & usage`}
        aria-label={`Current plan: ${billing?.planTierLabel ?? "…"} — View plan & usage`}
        className="flex h-10 items-center justify-center rounded-lg bg-accent text-white no-underline hover:bg-accent-hover"
      >
        <CreditCardIcon className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-card p-3 shadow-sm">
      <div className="text-xs font-medium text-subtle">Current Plan</div>
      <div className="mt-0.5 text-base font-semibold text-ink">{billing?.planTierLabel ?? "…"}</div>
      {renewalLine && <div className="mt-0.5 text-xs text-subtle">{renewalLine}</div>}
      <Link
        to={`/dashboard/${tenantId}/settings/billing`}
        className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-center text-sm font-semibold text-white no-underline hover:bg-accent-hover"
      >
        <CreditCardIcon className="h-4 w-4" />
        View plan &amp; usage
      </Link>
    </div>
  );
}

function MobileAccountSheet({
  tenantId,
  tenant,
  account,
  usage,
  email,
  firstName,
  lastName,
  picture,
  onClose,
  onLogout,
}: {
  tenantId?: string;
  tenant: TenantSummary | null;
  account: AccountHealth | null;
  usage: UsageSummary | null;
  email?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  const tokenPct = usage ? Math.min(100, Math.round((usage.tokens.used / Math.max(usage.tokens.allowance, 1)) * 100)) : 0;
  const profileName = [firstName, lastName].filter(Boolean).join(" ") || deriveDisplayName(email);
  const profileInitial = (firstName?.charAt(0) || email?.charAt(0) || "?").toUpperCase();

  return (
    <BottomSheet title="Account" onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-accent">
          <InstagramMarkIcon className="h-5.5 w-5.5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-ink">{tenant?.name ?? "…"}</div>
          {account?.connected ? (
            <span className="pill pill-ok m-0 inline-block">
              <span className="mr-1">●</span>Connected
            </span>
          ) : (
            <span className="text-sm text-subtle">Instagram not connected</span>
          )}
        </div>
      </div>

      {usage && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm text-subtle">
            <span>AI usage</span>
            <span>
              {usage.tokens.used >= 1000 ? `${(usage.tokens.used / 1000).toFixed(1)}K` : usage.tokens.used}
              {" / "}
              {usage.tokens.allowance >= 1000 ? `${(usage.tokens.allowance / 1000).toFixed(0)}K` : usage.tokens.allowance}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-chip">
            <div
              className={`h-full rounded-full ${usage.tokens.nearingLimit ? "bg-err-ink" : "bg-accent"}`}
              style={{ width: `${tokenPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-base font-semibold text-white">
          {picture ? (
            <img src={picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : profileInitial}
        </span>
        <div>
          <div className="text-base font-medium text-ink">{profileName}</div>
          <div className="text-sm text-subtle">Owner</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-4 py-3">
        <span className="text-sm font-medium text-ink">Theme</span>
        <ThemeToggle />
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {tenantId && (
          <>
            <Link
              to={`/dashboard/${tenantId}/settings`}
              onClick={onClose}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line px-4 py-3 text-left text-sm font-medium text-ink no-underline hover:bg-chip"
            >
              <SettingsIcon className="h-4.5 w-4.5" />
              Workspace settings
            </Link>
            <Link
              to={`/dashboard/${tenantId}/settings/billing`}
              onClick={onClose}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line px-4 py-3 text-left text-sm font-medium text-ink no-underline hover:bg-chip"
            >
              <CreditCardIcon className="h-4.5 w-4.5" />
              Plan &amp; usage
            </Link>
          </>
        )}
        <Link
          to="/docs"
          onClick={onClose}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line px-4 py-3 text-left text-sm font-medium text-ink no-underline hover:bg-chip"
        >
          <BookIcon className="h-4.5 w-4.5" />
          Help &amp; documentation
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line px-4 py-3 text-left text-sm font-medium text-ink hover:bg-chip"
        >
          <LogoutIcon className="h-4.5 w-4.5" />
          Sign out
        </button>
      </div>
    </BottomSheet>
  );
}

function AccountHeader({
  tenantId,
  tenant,
  usage,
  email,
  firstName,
  lastName,
  picture,
  onLogout,
}: {
  tenantId?: string;
  tenant: TenantSummary | null;
  usage: UsageSummary | null;
  email?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  onLogout: () => void;
}) {
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const tokenPct = usage ? Math.min(100, Math.round((usage.tokens.used / Math.max(usage.tokens.allowance, 1)) * 100)) : 0;
  const profileName = [firstName, lastName].filter(Boolean).join(" ") || deriveDisplayName(email);
  const profileInitial = (firstName?.charAt(0) || email?.charAt(0) || "?").toUpperCase();

  const workspaceInitials = (tenant?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("") || "…";

  return (
    <header className="hidden h-14 items-center justify-between gap-4 border-b border-line bg-card px-5 md:flex">
      <div className="relative min-w-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={workspaceMenuOpen}
          onClick={() => setWorkspaceMenuOpen((v) => !v)}
          className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2 hover:bg-chip"
          title={tenant?.name ?? undefined}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chip text-sm font-semibold text-accent">
            {workspaceInitials}
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-semibold text-ink">{tenant?.name ?? "…"}</span>
            <span className="block text-xs text-subtle">Workspace</span>
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-subtle" />
        </button>
        {workspaceMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setWorkspaceMenuOpen(false)}
            />
            <div className="absolute left-0 top-11 z-20 w-72 rounded-xl border border-line bg-card p-1.5 shadow-lg" role="menu" aria-label="Switch workspace">
              <div className="px-2.5 py-2">
                <div className="text-sm font-semibold text-ink">Switch workspace</div>
                <div className="text-xs text-subtle">Select the business context you want to work in.</div>
              </div>
              <div
                role="menuitemradio"
                aria-checked="true"
                className="flex items-center gap-2.5 rounded-lg bg-chip px-2.5 py-2"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-card text-xs font-semibold text-accent">
                  {workspaceInitials}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-ink">{tenant?.name ?? "…"}</span>
                  <span className="block text-xs text-subtle">Current workspace</span>
                </span>
                <CheckCircleIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {usage && (
          // Hidden between `md` and `lg`: at that width the tenant name/connected-pill
          // block (which can't shrink past its content) and this widget don't both fit
          // in the header, and nothing clips the overflow — they visually collide. Token
          // usage stays reachable via the mobile account sheet below `md`.
          <div className="hidden w-36 lg:block">
            <div className="flex items-center justify-between text-xs text-subtle">
              <span>AI usage</span>
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

        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            title="Notifications"
            onClick={() => setNotificationsOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink"
          >
            <BellIcon className="h-4.5 w-4.5" />
          </button>
          {notificationsOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="absolute right-0 top-11 z-20 w-80 rounded-xl border border-line bg-card p-3 shadow-lg" role="dialog" aria-label="Notifications">
                <div className="mb-2 text-sm font-semibold text-ink">Notifications</div>
                <p className="muted small m-0">
                  This workspace doesn&rsquo;t have a live notification system yet — you&rsquo;ll see real alerts here once one exists.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-chip"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-white">
              {picture ? (
                <img src={picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : profileInitial}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-medium text-ink">{profileName}</span>
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
              <div className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-line bg-card p-1.5 shadow-lg" role="menu" aria-label={`${profileName} account menu`}>
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-white">
                    {picture ? (
                      <img src={picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                    ) : profileInitial}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium text-ink">{profileName}</span>
                    <span className="block text-xs text-subtle">Owner</span>
                  </span>
                </div>
                <div className="my-1 border-t border-line" />
                {tenantId && (
                  <>
                    <Link
                      to={`/dashboard/${tenantId}/settings`}
                      onClick={() => setProfileOpen(false)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink no-underline hover:bg-chip"
                      role="menuitem"
                    >
                      <SettingsIcon className="h-4 w-4" />
                      Workspace settings
                    </Link>
                    <Link
                      to={`/dashboard/${tenantId}/settings/billing`}
                      onClick={() => setProfileOpen(false)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink no-underline hover:bg-chip"
                      role="menuitem"
                    >
                      <CreditCardIcon className="h-4 w-4" />
                      Plan &amp; usage
                    </Link>
                  </>
                )}
                <Link
                  to="/docs"
                  onClick={() => setProfileOpen(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink no-underline hover:bg-chip"
                  role="menuitem"
                >
                  <BookIcon className="h-4 w-4" />
                  Help &amp; documentation
                </Link>
                <div className="my-1 border-t border-line" />
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-chip"
                  role="menuitem"
                >
                  <LogoutIcon className="h-4 w-4" />
                  Sign out
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
  // Desktop-only icon rail: persisted per browser, never affects the mobile drawer (which always shows labels).
  // Defaults to collapsed (matching the preview's own default) until a user explicitly expands it.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("signalai.sidebarCollapsed");
    return stored === null ? true : stored === "1";
  });
  useEffect(() => {
    window.localStorage.setItem("signalai.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);
  // Toggling hides whichever button was just clicked/activated (it belongs
  // to the other state), which would otherwise drop keyboard focus to
  // <body>. Only reclaim focus when a toggle actually just happened — never
  // on mount, so loading a saved "collapsed" preference doesn't steal focus.
  const expandSidebarButtonRef = useRef<HTMLButtonElement | null>(null);
  const collapseSidebarButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarToggledByUserRef = useRef(false);
  useEffect(() => {
    if (!sidebarToggledByUserRef.current) return;
    sidebarToggledByUserRef.current = false;
    (sidebarCollapsed ? expandSidebarButtonRef : collapseSidebarButtonRef).current?.focus();
  }, [sidebarCollapsed]);
  function toggleSidebarCollapsed(next: boolean) {
    sidebarToggledByUserRef.current = true;
    setSidebarCollapsed(next);
  }
  const mobileNavRef = useRef<HTMLElement | null>(null);
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
    const media = window.matchMedia("(max-width: 767px)");
    const syncViewport = (event: MediaQueryList | MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
      if (!event.matches) setMobileNavOpen(false);
    };
    syncViewport(media);
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen || !isMobileViewport) return;

    const drawer = mobileNavRef.current;
    if (!drawer) return;

    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousBodyOverflow = document.body.style.overflow;
    const getFocusable = () =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

    document.body.style.overflow = "hidden";
    (getFocusable()[0] ?? drawer).focus();

    function handleDrawerKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        drawer!.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !drawer!.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawer!.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDrawerKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDrawerKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (previousActiveElement?.isConnected) previousActiveElement.focus();
    };
  }, [isMobileViewport, mobileNavOpen]);

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
    Promise.all([
      api.getAccountHealth(tenantId),
      api.getUsage(tenantId),
      api.getBilling(tenantId),
      api.getLeads(tenantId, { unreadOnly: true }),
    ])
      .then(([a, u, b, unread]) => {
        if (cancelled) return;
        setAccount(a);
        setUsage(u);
        setBilling(b);
        setUnreadCount(unread.length);
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
    <div className="flex h-screen overflow-hidden bg-canvas text-ink">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        ref={mobileNavRef}
        id="primary-navigation-drawer"
        role={mobileNavOpen && isMobileViewport ? "dialog" : undefined}
        aria-modal={mobileNavOpen && isMobileViewport ? true : undefined}
        aria-label="Primary navigation"
        tabIndex={mobileNavOpen && isMobileViewport ? -1 : undefined}
        inert={isMobileViewport && !mobileNavOpen}
        data-collapsed={sidebarCollapsed ? "true" : undefined}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sidebar transition-[transform,width] duration-200 motion-reduce:transition-none md:static md:z-auto md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className={`flex items-center px-5 py-5 ${sidebarCollapsed ? "md:justify-center" : "justify-between"}`}>
          {/*
           * Below `md` (the mobile drawer) this button is always a no-op —
           * `sidebarCollapsed` only affects `md:`-prefixed classes, so
           * clicking the logo there just sets a desktop preference the
           * drawer itself never reads.
           */}
          <button
            ref={expandSidebarButtonRef}
            type="button"
            aria-label={sidebarCollapsed && !isMobileViewport ? "Expand sidebar" : "SignalAI"}
            title={sidebarCollapsed && !isMobileViewport ? "Expand sidebar" : undefined}
            tabIndex={sidebarCollapsed && !isMobileViewport ? 0 : -1}
            onClick={() => toggleSidebarCollapsed(false)}
            className="flex items-center gap-1.5 rounded-lg"
          >
            <Logo size="md" wordmarkClassName={sidebarCollapsed ? "md:hidden" : ""} />
            {sidebarCollapsed && <SidebarExpandIcon className="hidden h-4 w-4 shrink-0 text-subtle md:block" />}
          </button>
          <button
            ref={collapseSidebarButtonRef}
            type="button"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            onClick={() => toggleSidebarCollapsed(true)}
            className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink md:flex ${sidebarCollapsed ? "md:hidden" : ""}`}
          >
            <PanelToggleIcon className="h-4.5 w-4.5" />
          </button>
          <div className="flex items-center gap-1 md:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="flex h-11 w-11 items-center justify-center text-subtle"
              onClick={() => setMobileNavOpen(false)}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <NavList
            items={PRIMARY_NAV}
            tenantId={tenantId}
            onNavigate={() => setMobileNavOpen(false)}
            badges={{ inbox: unreadCount }}
            collapsed={sidebarCollapsed}
          />
          <div className="my-4 border-t border-line" />
          <div className={`mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-subtle ${sidebarCollapsed ? "md:hidden" : ""}`}>
            Workspace
          </div>
          <NavList
            items={SECONDARY_NAV}
            tenantId={tenantId}
            onNavigate={() => setMobileNavOpen(false)}
            collapsed={sidebarCollapsed}
          />
        </nav>

        <div className="border-t border-line p-3">
          <div className={sidebarCollapsed ? "md:hidden" : ""}>
            <PlanCard tenantId={tenantId} billing={billing} />
          </div>
          <div className={`hidden ${sidebarCollapsed ? "md:block" : ""}`}>
            <PlanCard tenantId={tenantId} billing={billing} collapsed />
          </div>
        </div>
      </aside>

      <div
        inert={mobileNavOpen && isMobileViewport}
        className="flex h-full min-w-0 flex-1 flex-col"
      >
        <header className="flex items-center gap-3 border-b border-line bg-card px-4 py-3 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            aria-controls="primary-navigation-drawer"
            className="flex h-11 w-11 items-center justify-center"
            onClick={() => setMobileNavOpen(true)}
          >
            <MenuIcon className="h-6 w-6" />
          </button>
          <Logo size="sm" className="flex-1" />
          <button
            type="button"
            aria-label="Account"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
            onClick={() => setMobileAccountOpen(true)}
          >
            {session?.picture ? (
              <img src={session.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover" />
            ) : (session?.firstName?.charAt(0) || session?.email?.charAt(0) || "?").toUpperCase()}
          </button>
        </header>

        <AccountHeader
          tenantId={tenantId}
          tenant={tenant}
          usage={usage}
          email={session?.email}
          firstName={session?.firstName}
          lastName={session?.lastName}
          picture={session?.picture}
          onLogout={handleLogout}
        />

        {mobileAccountOpen && (
          <MobileAccountSheet
            tenantId={tenantId}
            tenant={tenant}
            account={account}
            usage={usage}
            email={session?.email}
            firstName={session?.firstName}
            lastName={session?.lastName}
            picture={session?.picture}
            onClose={() => setMobileAccountOpen(false)}
            onLogout={handleLogout}
          />
        )}

        <main className="min-w-0 flex-1 overflow-y-auto">
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
