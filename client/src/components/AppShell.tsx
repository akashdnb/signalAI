import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  api,
  clearSession,
  loadSession,
  saveSession,
  type BillingSummary,
  type TenantSummary,
  type UsageSummary,
} from "../api";
import { workspaceApi, type ConnectedInstagramAccount, type WorkspaceRole, type WorkspaceSummary } from "../api/workspace";
import { BottomSheet } from "./BottomSheet";
import { TenantContext } from "../context/TenantContext";
import { deriveDisplayName } from "../lib/leadFormatting";
import { Logo } from "./Logo";
import { OnboardingWizard } from "./OnboardingWizard";
import { ThemeToggle } from "./ThemeToggle";
import { ConnectedAccountSwitcher, type ConnectedAccountSwitcherOption, type WorkspaceSwitcherOption } from "./ui/ConnectedAccountSwitcher";
import {
  AnalyticsIcon,
  AutomationIcon,
  BellIcon,
  BookIcon,
  BroadcastIcon,
  ChevronDownIcon,
  CloseIcon,
  ContactsIcon,
  ContentIcon,
  CreditCardIcon,
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
  { to: "contacts", label: "Contacts", icon: ContactsIcon, disabled: true },
  { to: "broadcasts", label: "Broadcasts", icon: BroadcastIcon, disabled: true },
];

const SECONDARY_NAV: NavItem[] = [
  { to: "team", label: "Team", icon: TeamIcon },
  { to: "integrations", label: "Integrations", icon: IntegrationsIcon },
  { to: "billing", label: "Billing", icon: CreditCardIcon },
  { to: "settings", label: "Settings", icon: SettingsIcon },
];

function NavList({
  items,
  tenantId,
  onNavigate,
  badges,
}: {
  items: NavItem[];
  tenantId: string;
  onNavigate: () => void;
  badges?: Record<string, number>;
}) {
  return (
    <ul className="list-none space-y-1 p-0">
      {items.map((item) =>
        item.disabled ? (
          <li key={item.label}>
            <span
              className="flex max-md:min-h-11 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-subtle opacity-60"
              title="Coming soon"
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
              <span className="ml-auto rounded-full bg-chip px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">
                Soon
              </span>
            </span>
          </li>
        ) : (
          <li key={item.label}>
            <NavLink
              to={`/dashboard/${tenantId}/${item.to}`}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex max-md:min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline transition-colors ${
                  isActive ? "bg-chip text-accent" : "text-ink hover:bg-chip"
                }`
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
              {Boolean(badges?.[item.to]) && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-err-ink px-1.5 text-[11px] font-semibold text-white">
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
        to={`/dashboard/${tenantId}/billing`}
        className="mt-2.5 block rounded-lg bg-accent px-3 py-1.5 text-center text-sm font-semibold text-white no-underline hover:bg-accent-hover"
      >
        Upgrade
      </Link>
    </div>
  );
}

type WorkspaceContextControls = {
  workspaceOptions: WorkspaceSwitcherOption[] | null;
  currentWorkspaceId: string;
  currentWorkspaceRole: WorkspaceRole | null;
  workspaceError: string | null;
  onReloadWorkspaces: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: (name: string, description: string) => Promise<WorkspaceSwitcherOption>;
  connectedAccounts: ConnectedInstagramAccount[] | null;
  accountOptions: ConnectedAccountSwitcherOption[];
  selectedAccountId: string | null;
  accountError: string | null;
  accountsLoading: boolean;
  onSelectAccount: (accountId: string) => void;
  onManageAccounts: () => void;
  showAccountSelector: boolean;
};

function accountHealthSummary(accounts: ConnectedInstagramAccount[] | null, error: string | null): string {
  if (accounts === null) return error ? "Connection status unavailable" : "Checking Instagram accounts…";
  if (accounts.length === 0) return "No Instagram accounts connected";
  const attention = accounts.filter((account) => account.status !== "healthy").length;
  return accounts.length + " Instagram account" + (accounts.length === 1 ? "" : "s")
    + (attention > 0 ? " · " + attention + " need attention" : " · All healthy");
}

function MobileAccountSheet({
  tenant,
  connectedAccounts,
  usage,
  email,
  firstName,
  lastName,
  picture,
  workspaceOptions,
  currentWorkspaceId,
  currentWorkspaceRole,
  workspaceError,
  onReloadWorkspaces,
  onSelectWorkspace,
  onCreateWorkspace,
  accountOptions,
  selectedAccountId,
  accountError,
  accountsLoading,
  onSelectAccount,
  onManageAccounts,
  showAccountSelector,
  onClose,
  onLogout,
}: {
  tenant: TenantSummary | null;
  connectedAccounts: ConnectedInstagramAccount[] | null;
  usage: UsageSummary | null;
  email?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  onClose: () => void;
  onLogout: () => void;
} & WorkspaceContextControls) {
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
          <div className="truncate text-base font-semibold text-ink">{tenant?.name ?? "Workspace"}</div>
          <span className="text-sm text-subtle">{accountHealthSummary(connectedAccounts, accountError)}</span>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line p-2">
        <ConnectedAccountSwitcher
          workspaceName={tenant?.name ?? "Workspace"}
          providerLabel="Instagram"
          providerIcon={<InstagramMarkIcon />}
          accounts={accountOptions}
          selectedAccountId={selectedAccountId ?? ""}
          onSelect={onSelectAccount}
          onManageAccounts={onManageAccounts}
          workspaces={workspaceOptions}
          currentWorkspaceId={currentWorkspaceId}
          currentWorkspaceRole={currentWorkspaceRole}
          workspaceError={workspaceError}
          onReloadWorkspaces={onReloadWorkspaces}
          onSelectWorkspace={onSelectWorkspace}
          onCreateWorkspace={onCreateWorkspace}
          showAccountSelector={showAccountSelector}
          accountsLoading={accountsLoading}
          accountError={accountError}
        />
      </div>

      {usage && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm text-subtle">
            <span>AI Tokens</span>
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
          <div className="text-sm text-subtle">{currentWorkspaceRole ? currentWorkspaceRole.charAt(0).toUpperCase() + currentWorkspaceRole.slice(1) : "Workspace access loading"}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-4 py-3">
        <span className="text-sm font-medium text-ink">Theme</span>
        <ThemeToggle />
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-xl border border-line px-4 py-3 text-left text-sm font-medium text-ink hover:bg-chip"
      >
        <LogoutIcon className="h-4.5 w-4.5" />
        Log out
      </button>
    </BottomSheet>
  );
}

function AccountHeader({
  tenant,
  connectedAccounts,
  usage,
  email,
  firstName,
  lastName,
  picture,
  workspaceOptions,
  currentWorkspaceId,
  currentWorkspaceRole,
  workspaceError,
  onReloadWorkspaces,
  onSelectWorkspace,
  onCreateWorkspace,
  accountOptions,
  selectedAccountId,
  accountError,
  accountsLoading,
  onSelectAccount,
  onManageAccounts,
  showAccountSelector,
  onLogout,
}: {
  tenant: TenantSummary | null;
  connectedAccounts: ConnectedInstagramAccount[] | null;
  usage: UsageSummary | null;
  email?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  onLogout: () => void;
} & WorkspaceContextControls) {
  const [profileOpen, setProfileOpen] = useState(false);
  const tokenPct = usage ? Math.min(100, Math.round((usage.tokens.used / Math.max(usage.tokens.allowance, 1)) * 100)) : 0;
  const profileName = [firstName, lastName].filter(Boolean).join(" ") || deriveDisplayName(email);
  const profileInitial = (firstName?.charAt(0) || email?.charAt(0) || "?").toUpperCase();

  return (
    <header className="hidden h-14 items-center justify-between gap-4 border-b border-line bg-card px-5 md:flex">
      <div className="flex min-w-0 items-center gap-3">
        <ConnectedAccountSwitcher
          workspaceName={tenant?.name ?? "Workspace"}
          providerLabel="Instagram"
          providerIcon={<InstagramMarkIcon />}
          accounts={accountOptions}
          selectedAccountId={selectedAccountId ?? ""}
          onSelect={onSelectAccount}
          onManageAccounts={onManageAccounts}
          workspaces={workspaceOptions}
          currentWorkspaceId={currentWorkspaceId}
          currentWorkspaceRole={currentWorkspaceRole}
          workspaceError={workspaceError}
          onReloadWorkspaces={onReloadWorkspaces}
          onSelectWorkspace={onSelectWorkspace}
          onCreateWorkspace={onCreateWorkspace}
          showAccountSelector={showAccountSelector}
          accountsLoading={accountsLoading}
          accountError={accountError}
        />
        <span className="hidden xl:block truncate text-xs text-subtle" title={accountHealthSummary(connectedAccounts, accountError)}>
          {accountHealthSummary(connectedAccounts, accountError)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {usage && (
          <div className="w-36">
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
          aria-label="Notifications (coming soon)"
          title="Notifications are not available yet"
          disabled
          className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg text-subtle opacity-50"
        >
          <BellIcon className="h-4.5 w-4.5" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-chip"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-sm font-semibold text-white">
              {picture ? (
                <img src={picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : profileInitial}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-medium text-ink">{profileName}</span>
              <span className="block text-xs text-subtle">{currentWorkspaceRole ? currentWorkspaceRole.charAt(0).toUpperCase() + currentWorkspaceRole.slice(1) : "Workspace access loading"}</span>
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
  const location = useLocation();
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedInstagramAccount[] | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  );
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
  // tenantId is a requested workspace context, not an authorization token. Every tenant endpoint re-checks membership server-side.
  const sessionValid = Boolean(tenantId && session?.token);

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

  async function reloadWorkspaces(): Promise<WorkspaceSummary[] | null> {
    try {
      const next = await workspaceApi.listWorkspaces();
      setWorkspaces(next);
      setWorkspaceError(null);
      return next;
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        clearSession();
        navigate("/login", { replace: true });
      }
      setWorkspaces(null);
      setWorkspaceError(err instanceof Error ? err.message : "Could not load your workspaces.");
      return null;
    }
  }

  async function reloadConnectedAccounts(): Promise<void> {
    if (!tenantId) return;
    try {
      const next = await workspaceApi.listConnectedAccounts(tenantId);
      setConnectedAccounts(next);
      setAccountError(null);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        clearSession();
        navigate("/login", { replace: true });
      }
      setConnectedAccounts(null);
      setAccountError(err instanceof Error ? err.message : "Could not load Instagram accounts.");
    }
  }

  async function reloadTenant() {
    if (!tenantId) return;
    try {
      const t = await api.getTenant(tenantId);
      setTenant(t);
      setTenantError(null);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        navigate("/login", { replace: true });
        return;
      }
      if (status === 403) {
        const available = await reloadWorkspaces();
        const fallback = available?.find((workspace) => workspace.tenantId !== tenantId) ?? available?.[0];
        if (fallback) {
          const activeSession = loadSession();
          if (activeSession) saveSession({ ...activeSession, tenantId: fallback.tenantId });
          navigate("/dashboard/" + fallback.tenantId, { replace: true });
          return;
        }
        setTenantError("Access denied: this workspace is not available to your account. Ask a workspace owner to invite you, or sign in with another account.");
        return;
      }
      setTenantError(err instanceof Error ? err.message : "Failed to load workspace");
    }
  }

  useEffect(() => {
    if (sessionValid) {
      void reloadTenant();
      void reloadWorkspaces();
      void reloadConnectedAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, sessionValid]);

  useEffect(() => {
    if (!tenantId) {
      setSelectedAccountIdState(null);
      return;
    }
    const stored = localStorage.getItem("signalai.account-context:" + tenantId);
    setSelectedAccountIdState(stored || null);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || connectedAccounts === null) return;
    const key = "signalai.account-context:" + tenantId;
    const stored = localStorage.getItem(key);
    if (stored && connectedAccounts.some((account) => account.id === stored)) {
      setSelectedAccountIdState(stored);
    } else {
      if (stored) localStorage.removeItem(key);
      setSelectedAccountIdState(null);
    }
  }, [tenantId, connectedAccounts]);

  async function handleSelectWorkspace(workspaceId: string) {
    let target = workspaces?.find((workspace) => workspace.tenantId === workspaceId);
    if (!target) {
      const refreshed = await reloadWorkspaces();
      target = refreshed?.find((workspace) => workspace.tenantId === workspaceId);
    }
    if (!target) {
      setWorkspaceError("That workspace is not in the list of workspaces available to your account.");
      return;
    }
    const activeSession = loadSession();
    if (!activeSession) {
      navigate("/login", { replace: true });
      return;
    }

    const routePrefix = "/dashboard/" + tenantId;
    let suffix = location.pathname.startsWith(routePrefix) ? location.pathname.slice(routePrefix.length) : "";
    if (suffix.startsWith("/leads/")) suffix = "/leads";
    else if (suffix.startsWith("/inbox/")) suffix = "/inbox";
    else if (suffix.startsWith("/automation/")) suffix = "/automation";
    else if (!["", "/inbox", "/leads", "/automation", "/knowledge", "/content", "/analytics", "/team", "/integrations", "/billing", "/settings"].includes(suffix)) suffix = "";

    saveSession({ ...activeSession, tenantId: target.tenantId });
    setSelectedAccountIdState(null);
    navigate("/dashboard/" + target.tenantId + suffix);
  }

  async function handleCreateWorkspace(name: string, description: string): Promise<WorkspaceSwitcherOption> {
    const created = await workspaceApi.createWorkspace(name, description);
    setWorkspaces((current) => [...(current ?? []).filter((workspace) => workspace.tenantId !== created.tenantId), created]);
    setWorkspaceError(null);
    return { id: created.tenantId, name: created.name, description: created.description, role: created.role };
  }

  function handleSelectAccount(accountId: string) {
    if (!tenantId) return;
    const key = "signalai.account-context:" + tenantId;
    if (!accountId) {
      localStorage.removeItem(key);
      setSelectedAccountIdState(null);
      return;
    }
    if (!connectedAccounts?.some((account) => account.id === accountId)) {
      setAccountError("Choose an Instagram account from the server-provided account list.");
      return;
    }
    localStorage.setItem(key, accountId);
    setSelectedAccountIdState(accountId);
    setAccountError(null);
  }

  function handleManageAccounts() {
    if (!tenantId) return;
    setMobileAccountOpen(false);
    navigate("/dashboard/" + tenantId + "/integrations");
  }

  useEffect(() => {
    if (!sessionValid || !tenantId) return;
    let cancelled = false;
    Promise.all([
      api.getUsage(tenantId),
      api.getBilling(tenantId),
      api.getLeads(tenantId, { unreadOnly: true }),
    ])
      .then(([u, b, unread]) => {
        if (cancelled) return;
        setUsage(u);
        setBilling(b);
        setUnreadCount(unread.length);
      })
      .catch(() => {
        // Header usage chrome degrades gracefully; page-level data remains responsible for actionable errors.
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
  const workspaceRole = workspaces?.find((workspace) => workspace.tenantId === tenantId)?.role ?? null;
  const workspaceOptions: WorkspaceSwitcherOption[] | null = workspaces?.map((workspace) => ({
    id: workspace.tenantId,
    name: workspace.name,
    description: workspace.description,
    role: workspace.role,
  })) ?? null;
  const accountOptions: ConnectedAccountSwitcherOption[] = (connectedAccounts ?? []).map((account) => ({
    id: account.id,
    handle: account.instagramUsername ? "@" + account.instagramUsername : "Instagram account",
    label: account.instagramUsername ? "@" + account.instagramUsername : "Instagram account",
    connected: account.status === "healthy",
  }));
  const accountsLoading = connectedAccounts === null && accountError === null;
  const showAccountSelector = /\\/content\\/?$/.test(location.pathname);

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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sidebar transition-transform duration-200 md:static md:z-auto md:w-[212px] md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Logo size="md" />
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
          />
          <div className="my-4 border-t border-line" />
          <NavList items={SECONDARY_NAV} tenantId={tenantId} onNavigate={() => setMobileNavOpen(false)} />
        </nav>

        <div className="border-t border-line p-3">
          <PlanCard tenantId={tenantId} billing={billing} />
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
          tenant={tenant}
          connectedAccounts={connectedAccounts}
          usage={usage}
          email={session?.email}
          firstName={session?.firstName}
          lastName={session?.lastName}
          picture={session?.picture}
          workspaceOptions={workspaceOptions}
          currentWorkspaceId={tenantId}
          currentWorkspaceRole={workspaceRole}
          workspaceError={workspaceError}
          onReloadWorkspaces={() => { void reloadWorkspaces(); }}
          onSelectWorkspace={(id) => { void handleSelectWorkspace(id); }}
          onCreateWorkspace={handleCreateWorkspace}
          accountOptions={accountOptions}
          selectedAccountId={selectedAccountId}
          accountError={accountError}
          accountsLoading={accountsLoading}
          onSelectAccount={handleSelectAccount}
          onManageAccounts={handleManageAccounts}
          showAccountSelector={showAccountSelector}
          onLogout={handleLogout}
        />

        {mobileAccountOpen && (
          <MobileAccountSheet
            tenant={tenant}
            connectedAccounts={connectedAccounts}
            usage={usage}
            email={session?.email}
            firstName={session?.firstName}
            lastName={session?.lastName}
            picture={session?.picture}
            workspaceOptions={workspaceOptions}
            currentWorkspaceId={tenantId}
            currentWorkspaceRole={workspaceRole}
            workspaceError={workspaceError}
            onReloadWorkspaces={() => { void reloadWorkspaces(); }}
            onSelectWorkspace={(id) => { void handleSelectWorkspace(id); }}
            onCreateWorkspace={handleCreateWorkspace}
            accountOptions={accountOptions}
            selectedAccountId={selectedAccountId}
            accountError={accountError}
            accountsLoading={accountsLoading}
            onSelectAccount={handleSelectAccount}
            onManageAccounts={handleManageAccounts}
            showAccountSelector={showAccountSelector}
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
          <TenantContext.Provider value={{
            tenant,
            error: tenantError,
            reload: () => { void reloadTenant(); },
            workspaces,
            workspaceError,
            workspaceRole,
            reloadWorkspaces: () => { void reloadWorkspaces(); },
            connectedAccounts,
            accountError,
            reloadConnectedAccounts: () => { void reloadConnectedAccounts(); },
            selectedAccountId,
            setSelectedAccountId: handleSelectAccount,
          }}>
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
