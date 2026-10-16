import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { WorkspaceRole } from "../../api/workspace";
import { createPortal } from "react-dom";
import { CheckCircleIcon, ChevronDownIcon } from "../icons";
import "./ConnectedAccountSwitcher.css";

export type ConnectedAccountSwitcherOption = { id: string; handle: string; label: string; connected?: boolean };
export type WorkspaceSwitcherOption = { id: string; name: string; description: string | null; role: WorkspaceRole };
export type ConnectedAccountSwitcherProps = {
  workspaceName: string;
  providerLabel: string;
  providerIcon: ReactNode;
  accounts: ConnectedAccountSwitcherOption[];
  selectedAccountId: string;
  onSelect: (accountId: string) => void;
  onManageAccounts?: () => void;
  previewOnly?: boolean;
  workspaces?: WorkspaceSwitcherOption[] | null;
  currentWorkspaceId?: string;
  currentWorkspaceRole?: WorkspaceRole | null;
  workspaceError?: string | null;
  onReloadWorkspaces?: () => void;
  onSelectWorkspace?: (workspaceId: string) => void;
  onCreateWorkspace?: (name: string, description: string) => Promise<WorkspaceSwitcherOption>;
  showAccountSelector?: boolean;
  accountsLoading?: boolean;
  accountError?: string | null;
};
type Workspace = { id: string; name: string; description: string; initials: string };
const WORKSPACES: Workspace[] = [
  { id: "my-workspace", name: "My workspace", description: "Current workspace", initials: "MW" },
  { id: "studio-north", name: "Studio North", description: "Example workspace", initials: "SN" },
  { id: "client-demo", name: "Client Demo", description: "Example workspace", initials: "CD" },
];
const ACCOUNT_SCREENS = new Set(["inbox", "leads", "content", "analytics"]);
function currentScreen() { return new URLSearchParams(window.location.search).get("screen") ?? "overview"; }
function updatePreviewQuery(values: Record<string, string>) { const params = new URLSearchParams(window.location.search); params.set("preview", "precision-operations"); Object.entries(values).forEach(([key, value]) => params.set(key, value)); window.history.replaceState(null, "", window.location.pathname + "?" + params.toString()); }
function InstagramContextFilter({ accounts, selectedAccountId, onSelect }: Pick<ConnectedAccountSwitcherProps, "accounts" | "selectedAccountId" | "onSelect">) {
  const [value, setValue] = useState(selectedAccountId || "all");
  const [target, setTarget] = useState<Element | null>(null);
  const screen = currentScreen();
  useEffect(() => {
    const selector = screen === "leads" ? ".po-leads-filter-row" : screen === "analytics" ? ".po-analytics-controls" : ".po-screen-toolbar";
    const sync = () => setTarget(document.querySelector(selector));
    sync();
    const frame = window.requestAnimationFrame(sync);
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("igAccount");
    setValue(next && accounts.some(account => account.id === next) ? next : "all");
  }, [accounts]);
  if (!ACCOUNT_SCREENS.has(screen) || !target) return null;
  const label = screen === "inbox" ? "Instagram account" : "Account";
  return createPortal(
    <label className="sai-account-switcher__search sai-account-switcher__filter" style={{ margin: 0, minWidth: 0, maxWidth: "260px" }}>
      <span style={{ color: "var(--po-color-muted)", fontSize: "11px", fontWeight: 750, whiteSpace: "nowrap" }}>{label}</span>
      <select aria-label={`${label} filter`} value={value} onChange={event => { const next = event.target.value; setValue(next); if (next !== "all") onSelect(next); updatePreviewQuery({ igAccount: next }); window.dispatchEvent(new CustomEvent("signalai:account-filter-change", { detail: { accountId: next, screen } })); }} style={{ flex: 1, minWidth: 110, height: 36, border: 0, outline: 0, background: "transparent", color: "var(--po-color-ink)", fontSize: "12px", fontWeight: 700 }}>
        <option value="all">All accounts</option>
        {accounts.map(account => <option key={account.id} value={account.id}>{account.handle}{account.connected === false ? " · Needs reconnect" : ""}</option>)}
      </select>
      <ChevronDownIcon className="sai-account-switcher__filter-chevron" aria-hidden="true" />
    </label>,
    target,
  );
}
function PreviewConnectedAccountSwitcher({ workspaceName, accounts, selectedAccountId, onSelect, providerLabel, providerIcon, onManageAccounts, previewOnly }: ConnectedAccountSwitcherProps) {
  void providerLabel;
  void providerIcon;
  void onManageAccounts;
  void previewOnly;
  const [open, setOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(() => new URLSearchParams(window.location.search).get("workspace") ?? "my-workspace");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedWorkspace = WORKSPACES.find(workspace => workspace.id === workspaceId) ?? WORKSPACES[0]!;

  useEffect(() => {
    if (!open) return;
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  const selectWorkspace = (workspace: Workspace) => {
    setWorkspaceId(workspace.id);
    updatePreviewQuery({ workspace: workspace.id });
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const screen = currentScreen();
  return <>
    <div className="sai-account-switcher" ref={rootRef}>
      <button ref={triggerRef} type="button" className="sai-account-switcher__trigger" aria-label={`Switch workspace. Current workspace ${selectedWorkspace.name || workspaceName}`} aria-haspopup="menu" aria-expanded={open} aria-controls="sai-workspace-menu" onClick={() => setOpen(current => !current)}>
        <span className="sai-account-switcher__provider-chip" aria-hidden="true">{selectedWorkspace.initials}</span>
        <span className="sai-account-switcher__identity"><strong>{selectedWorkspace.name || workspaceName}</strong><small>Workspace</small></span>
        <ChevronDownIcon className="sai-account-switcher__chevron" aria-hidden="true" />
      </button>
      {open && <div id="sai-workspace-menu" className="sai-account-switcher__panel" role="menu" aria-label="Switch workspace">
        <div className="sai-account-switcher__panel-heading">
          <div><strong>Switch workspace</strong><small>Select the business context you want to work in.</small></div>
        </div>
        <div className="sai-account-switcher__options">
          {WORKSPACES.map(workspace => <button key={workspace.id} type="button" role="menuitemradio" aria-checked={workspace.id === selectedWorkspace.id} className={"sai-account-switcher__option" + (workspace.id === selectedWorkspace.id ? " is-selected" : "")} onClick={() => selectWorkspace(workspace)}>
            <span className="sai-account-switcher__option-icon" aria-hidden="true">{workspace.initials}</span>
            <span className="sai-account-switcher__option-copy"><strong>{workspace.name}</strong><small>{workspace.description}</small></span>
            {workspace.id === selectedWorkspace.id && <CheckCircleIcon className="sai-account-switcher__selected-icon" aria-hidden="true" />}
          </button>)}
        </div>
      </div>}
    </div>
    {ACCOUNT_SCREENS.has(screen) && <InstagramContextFilter accounts={accounts} selectedAccountId={selectedAccountId} onSelect={onSelect} />}
  </>;
}

function workspaceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "WS";
  return (words.length === 1 ? words[0]!.slice(0, 2) : words.slice(0, 2).map((word) => word[0]).join("")).toUpperCase();
}

function roleLabel(role: WorkspaceRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Production mode reads real memberships/accounts from AppShell; the preview-only sample menu stays isolated below. */
function ProductWorkspaceSwitcher({
  workspaceName,
  providerLabel,
  providerIcon,
  accounts,
  selectedAccountId,
  onSelect,
  onManageAccounts,
  workspaces,
  currentWorkspaceId,
  currentWorkspaceRole,
  workspaceError,
  onReloadWorkspaces,
  onSelectWorkspace,
  onCreateWorkspace,
  showAccountSelector = false,
  accountsLoading = false,
  accountError,
}: ConnectedAccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedWorkspace = workspaces?.find((workspace) => workspace.id === currentWorkspaceId);
  const currentName = selectedWorkspace?.name ?? workspaceName;
  const currentRole = selectedWorkspace?.role ?? currentWorkspaceRole ?? null;
  const canCreateWorkspace = Boolean(onCreateWorkspace);

  useEffect(() => {
    if (!open) return;
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setCreateMode(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  function chooseWorkspace(workspaceId: string) {
    if (!workspaces?.some((workspace) => workspace.id === workspaceId)) return;
    setOpen(false);
    setCreateMode(false);
    onSelectWorkspace?.(workspaceId);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onCreateWorkspace || !createName.trim() || savingWorkspace) return;
    setSavingWorkspace(true);
    setCreateError(null);
    try {
      const workspace = await onCreateWorkspace(createName.trim(), createDescription.trim());
      setCreateName("");
      setCreateDescription("");
      setCreateMode(false);
      setOpen(false);
      onSelectWorkspace?.(workspace.id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Couldn't create the workspace.");
    } finally {
      setSavingWorkspace(false);
    }
  }

  return (
    <div className="sai-account-switcher sai-account-switcher--product" ref={rootRef}>
      <div className="relative min-w-0">
        <button
          ref={triggerRef}
          type="button"
          className="flex min-h-10 max-w-[240px] items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={"Switch workspace. Current workspace " + currentName + (currentRole ? ", " + roleLabel(currentRole) : "")}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="signalai-workspace-switcher-panel"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chip text-xs font-bold text-accent" aria-hidden="true">{workspaceInitials(currentName)}</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <strong className="max-w-[150px] truncate text-sm font-semibold text-ink">{currentName}</strong>
            <small className="text-xs text-subtle">{currentRole ? roleLabel(currentRole) + " workspace" : "Workspace"}</small>
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
        </button>

        {open && (
          <div
            id="signalai-workspace-switcher-panel"
            role="dialog"
            aria-label="Workspace switcher"
            className="absolute left-0 top-full z-[110] mt-2 w-[320px] max-w-[calc(100vw-24px)] rounded-xl border border-line bg-card p-2 shadow-lg"
          >
            <div className="border-b border-line px-2 pb-3 pt-2">
              <strong className="block text-sm font-semibold text-ink">{createMode ? "Create a workspace" : "Your workspaces"}</strong>
              <p className="mt-1 text-xs text-subtle">{createMode ? "Keep each business and its connected accounts separate." : "Switch to a workspace you belong to. Access is verified by the server."}</p>
            </div>

            {createMode ? (
              <form onSubmit={(event) => void createWorkspace(event)} className="space-y-3 p-2">
                <label className="block text-xs font-medium text-ink">
                  Workspace name
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="e.g. Acme Creators"
                    className="mt-1 block min-h-10 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
                  />
                </label>
                <label className="block text-xs font-medium text-ink">
                  Description <span className="font-normal text-subtle">(optional)</span>
                  <textarea
                    value={createDescription}
                    onChange={(event) => setCreateDescription(event.target.value)}
                    maxLength={300}
                    rows={2}
                    placeholder="What is this workspace for?"
                    className="mt-1 block w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink"
                  />
                </label>
                {createError && <p className="m-0 text-sm text-err-ink" role="alert">{createError}</p>}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="min-h-9 rounded-lg px-3 text-sm font-medium text-subtle hover:bg-chip" onClick={() => { setCreateMode(false); setCreateError(null); }} disabled={savingWorkspace}>Back</button>
                  <button type="submit" className="min-h-9 rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60" disabled={!createName.trim() || savingWorkspace}>{savingWorkspace ? "Creating…" : "Create workspace"}</button>
                </div>
              </form>
            ) : (
              <>
                {workspaces === null ? (
                  <div className="px-2 py-4 text-sm text-subtle" role="status">Loading workspaces…</div>
                ) : workspaces.length === 0 ? (
                  <div className="px-2 py-4 text-sm text-subtle">No workspace memberships were returned for this account.</div>
                ) : (
                  <div className="max-h-64 space-y-1 overflow-y-auto py-2">
                    {workspaces.map((workspace) => (
                      <button
                        type="button"
                        key={workspace.id}
                        className={"flex min-h-12 w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" + (workspace.id === currentWorkspaceId ? " bg-chip" : "")}
                        aria-current={workspace.id === currentWorkspaceId ? "true" : undefined}
                        onClick={() => chooseWorkspace(workspace.id)}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-chip text-[11px] font-bold text-accent" aria-hidden="true">{workspaceInitials(workspace.name)}</span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm font-medium text-ink">{workspace.name}</strong>
                          <small className="block truncate text-xs text-subtle">{workspace.description || roleLabel(workspace.role) + " access"}</small>
                        </span>
                        <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-subtle">{roleLabel(workspace.role)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {workspaceError && (
                  <div className="m-1 rounded-lg border border-line px-3 py-2 text-sm text-err-ink" role="alert">
                    <p className="m-0">{workspaceError}</p>
                    {onReloadWorkspaces && <button type="button" className="mt-2 text-xs font-semibold underline" onClick={onReloadWorkspaces}>Retry loading workspaces</button>}
                  </div>
                )}

                {canCreateWorkspace && (
                  <div className="border-t border-line pt-2">
                    <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold text-accent hover:bg-chip" onClick={() => { setCreateMode(true); setCreateError(null); }}>
                      <span aria-hidden="true">+</span> Create a workspace
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showAccountSelector && (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-card px-2.5 py-1.5">
          <span className="text-accent" aria-hidden="true">{providerIcon}</span>
          <label className="flex min-w-0 flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{providerLabel || "Account"} context</span>
            <select
              aria-label={providerLabel + " account context"}
              value={selectedAccountId || ""}
              disabled={accountsLoading || Boolean(accountError) || accounts.length === 0}
              onChange={(event) => onSelect(event.target.value)}
              className="max-w-[190px] bg-transparent text-sm font-medium text-ink outline-none disabled:cursor-not-allowed disabled:text-subtle"
            >
              {accountsLoading ? <option value="">Loading accounts…</option> : accounts.length === 0 ? <option value="">No accounts connected</option> : <option value="">All Instagram accounts</option>}
              {!accountsLoading && accounts.map((account) => <option value={account.id} key={account.id}>{account.handle}{account.connected === false ? " · Needs reconnect" : ""}</option>)}
            </select>
          </label>
          {accountError ? (
            <span title={accountError} className="text-xs text-err-ink" role="status">Unavailable</span>
          ) : accounts.length === 0 && !accountsLoading ? (
            <button type="button" className="whitespace-nowrap text-xs font-semibold text-accent" onClick={onManageAccounts}>Connect account</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ConnectedAccountSwitcher(props: ConnectedAccountSwitcherProps) {
  return props.previewOnly
    ? <PreviewConnectedAccountSwitcher {...props} />
    : <ProductWorkspaceSwitcher {...props} />;
}
