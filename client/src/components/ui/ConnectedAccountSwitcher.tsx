import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircleIcon, ChevronDownIcon } from "../icons";
import "./ConnectedAccountSwitcher.css";

export type ConnectedAccountSwitcherOption = { id: string; handle: string; label: string; connected?: boolean };
export type ConnectedAccountSwitcherProps = { workspaceName: string; providerLabel: string; providerIcon: ReactNode; accounts: ConnectedAccountSwitcherOption[]; selectedAccountId: string; onSelect: (accountId: string) => void; onManageAccounts?: () => void; previewOnly?: boolean; showAccountSelector?: boolean; accountsLoading?: boolean; accountError?: string | null; onRetryAccounts?: () => void };
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
type ProductAccountContextProps = ConnectedAccountSwitcherProps;

function ProductAccountContextSelector({
  providerLabel,
  providerIcon,
  accounts,
  selectedAccountId,
  onSelect,
  onManageAccounts,
  showAccountSelector = true,
  accountsLoading = false,
  accountError,
  onRetryAccounts,
}: ProductAccountContextProps) {
  const [value, setValue] = useState(selectedAccountId || "");
  useEffect(() => {
    setValue(selectedAccountId || "");
  }, [selectedAccountId, accounts]);

  if (!showAccountSelector) return null;

  return (
    <div className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-2">
      <span className="shrink-0 text-accent" aria-hidden="true">{providerIcon}</span>
      <label className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-medium text-subtle">{providerLabel || "Instagram"} account</span>
        <select
          aria-label={`${providerLabel || "Instagram"} account context`}
          value={value}
          disabled={accountsLoading || Boolean(accountError) || accounts.length === 0}
          onChange={(event) => {
            setValue(event.target.value);
            onSelect(event.target.value);
          }}
          className="min-h-8 max-w-[240px] bg-transparent text-sm font-medium text-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-subtle"
        >
          {accountsLoading ? (
            <option value="">Loading accounts…</option>
          ) : (
            <option value="">All Instagram accounts</option>
          )}
          {!accountsLoading && accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.handle}{account.connected === false ? " · Needs reconnect" : ""}
            </option>
          ))}
        </select>
      </label>
      {accountError ? (
        <span className="flex shrink-0 items-center gap-2" role="status">
          <span className="max-w-36 text-xs text-err-ink" title={accountError}>Unavailable</span>
          <button
            type="button"
            className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
            onClick={onRetryAccounts}
          >
            Retry
          </button>
        </span>
      ) : accounts.length === 0 && !accountsLoading ? (
        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-accent underline-offset-2 hover:underline"
          onClick={onManageAccounts}
        >
          Connect account
        </button>
      ) : null}
    </div>
  );
}

/** The existing preview sample selector is available only when explicitly requested. Product mode renders the server-backed account context control. */
export function ConnectedAccountSwitcher(props: ConnectedAccountSwitcherProps) {
  return props.previewOnly
    ? <PreviewConnectedAccountSwitcher {...props} />
    : <ProductAccountContextSelector {...props} />;
}
