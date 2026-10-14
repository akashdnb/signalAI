import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircleIcon, ChevronDownIcon, SearchIcon, SettingsIcon, PlusIcon } from "../icons";
import "./ConnectedAccountSwitcher.css";

export type ConnectedAccountSwitcherOption = {
  id: string;
  handle: string;
  label: string;
  connected?: boolean;
};

export type ConnectedAccountSwitcherProps = {
  workspaceName: string;
  providerLabel: string;
  providerIcon: ReactNode;
  accounts: ConnectedAccountSwitcherOption[];
  selectedAccountId: string;
  onSelect: (accountId: string) => void;
  onManageAccounts?: () => void;
  previewOnly?: boolean;
};

type Workspace = { id: string; name: string; description: string; initials: string };

const WORKSPACES: Workspace[] = [
  { id: "my-workspace", name: "My workspace", description: "Current workspace", initials: "MW" },
  { id: "studio-north", name: "Studio North", description: "Example workspace", initials: "SN" },
  { id: "client-demo", name: "Client Demo", description: "Example workspace", initials: "CD" },
];

const ACCOUNT_SCREENS = new Set(["inbox", "leads", "content", "analytics"]);

function currentScreen() {
  return new URLSearchParams(window.location.search).get("screen") ?? "overview";
}

function updatePreviewQuery(values: Record<string, string>) {
  const params = new URLSearchParams(window.location.search);
  params.set("preview", "precision-operations");
  Object.entries(values).forEach(([key, value]) => params.set(key, value));
  window.history.replaceState(null, "", window.location.pathname + "?" + params.toString());
}

function WorkspaceAvatar({ initials }: { initials: string }) {
  return <span className="sai-account-switcher__workspace-avatar" aria-hidden="true">{initials}</span>;
}

function InstagramContextFilter({
  accounts,
  selectedAccountId,
  onSelect,
}: Pick<ConnectedAccountSwitcherProps, "accounts" | "selectedAccountId" | "onSelect">) {
  const [value, setValue] = useState(selectedAccountId || "all");
  const screen = currentScreen();

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("igAccount");
    if (next && accounts.some(account => account.id === next)) setValue(next);
  }, [accounts]);

  if (!ACCOUNT_SCREENS.has(screen)) return null;

  const label = screen === "inbox" ? "Instagram account" : "Account";
  const targetSelector = screen === "leads"
    ? ".po-leads-filter-row"
    : screen === "analytics"
      ? ".po-analytics-controls"
      : ".po-screen-toolbar";
  const target = document.querySelector(targetSelector);
  if (!target) return null;

  return createPortal(
    <label className="sai-account-switcher__context-filter">
      <span>{label}</span>
      <span className="sai-account-switcher__context-control">
        {accounts[0]?.connected !== undefined ? <span className="sai-account-switcher__context-mark" aria-hidden="true">◎</span> : null}
        <select
          aria-label={`${label} filter`}
          value={value}
          onChange={event => {
            const next = event.target.value;
            setValue(next);
            if (next !== "all") onSelect(next);
            updatePreviewQuery({ igAccount: next });
            window.dispatchEvent(new CustomEvent("signalai:account-filter-change", { detail: { accountId: next, screen } }));
          }}
        >
          <option value="all">All accounts</option>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.handle}{account.connected === false ? " · Needs reconnect" : ""}</option>)}
        </select>
        <ChevronDownIcon aria-hidden="true" />
      </span>
    </label>,
    target,
  );
}

export function ConnectedAccountSwitcher({
  workspaceName,
  providerLabel,
  providerIcon,
  accounts,
  selectedAccountId,
  onSelect,
  onManageAccounts,
  previewOnly = false,
}: ConnectedAccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [workspaceId, setWorkspaceId] = useState(() => new URLSearchParams(window.location.search).get("workspace") ?? "my-workspace");
  const [workspaceDraft, setWorkspaceDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedWorkspace = WORKSPACES.find(workspace => workspace.id === workspaceId) ?? WORKSPACES[0]!;

  const filteredAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return accounts;
    return accounts.filter(account => [account.handle, account.label, account.id].some(value => value.toLowerCase().includes(normalizedQuery)));
  }, [accounts, query]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setCreateOpen(false);
      setQuery("");
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
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

  const manageWorkspace = () => {
    setOpen(false);
    updatePreviewQuery({ screen: "settings", settingsSection: "Workspace" });
    window.location.assign(window.location.pathname + "?" + new URLSearchParams(window.location.search).toString());
  };

  const createWorkspace = () => {
    if (!workspaceDraft.trim()) return;
    const next: Workspace = { id: `preview-${Date.now()}`, name: workspaceDraft.trim(), description: "Preview workspace", initials: workspaceDraft.trim().slice(0, 2).toUpperCase() };
    WORKSPACES.push(next);
    setWorkspaceId(next.id);
    setWorkspaceDraft("");
    setCreateOpen(false);
    setOpen(false);
    updatePreviewQuery({ workspace: next.id });
  };

  const screen = currentScreen();

  return (
    <>
      <div className="sai-account-switcher" ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          className="sai-account-switcher__trigger"
          aria-label={`Switch workspace. Current workspace ${selectedWorkspace.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="sai-workspace-menu"
          onClick={() => setOpen(current => !current)}
        >
          <WorkspaceAvatar initials={selectedWorkspace.initials} />
          <span className="sai-account-switcher__identity">
            <strong>{selectedWorkspace.name || workspaceName}</strong>
            <small>Workspace</small>
          </span>
          <ChevronDownIcon className="sai-account-switcher__chevron" aria-hidden="true" />
        </button>

        {open && (
          <div id="sai-workspace-menu" className="sai-account-switcher__workspace-panel" role="menu" aria-label="Workspaces">
            <div className="sai-account-switcher__panel-heading">
              <div><strong>Workspaces</strong><small>Switch business context</small></div>
            </div>
            <div className="sai-account-switcher__workspace-options">
              {WORKSPACES.map(workspace => (
                <button key={workspace.id} type="button" role="menuitemradio" aria-checked={workspace.id === selectedWorkspace.id} className={"sai-account-switcher__workspace-option" + (workspace.id === selectedWorkspace.id ? " is-selected" : "")} onClick={() => selectWorkspace(workspace)}>
                  <WorkspaceAvatar initials={workspace.initials} />
                  <span><strong>{workspace.name}</strong><small>{workspace.description}</small></span>
                  {workspace.id === selectedWorkspace.id && <CheckCircleIcon aria-hidden="true" />}
                </button>
              ))}
            </div>
            <div className="sai-account-switcher__workspace-footer">
              <button type="button" role="menuitem" onClick={() => setCreateOpen(true)}><PlusIcon />Create workspace</button>
              <button type="button" role="menuitem" onClick={manageWorkspace}><SettingsIcon />Manage workspace</button>
            </div>
            <p>Preview only · workspace switching does not load or move real data.</p>
          </div>
        )}

        {createOpen && (
          <div className="sai-account-switcher__modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setCreateOpen(false)}>
            <section className="sai-account-switcher__modal" role="dialog" aria-modal="true" aria-labelledby="sai-create-workspace-title">
              <div className="sai-account-switcher__modal-heading"><span><PlusIcon />Workspace setup</span><button type="button" aria-label="Close create workspace dialog" onClick={() => setCreateOpen(false)}>×</button></div>
              <h2 id="sai-create-workspace-title">Create a workspace</h2>
              <p>Keep connected accounts, automations, knowledge, leads, and team access separate.</p>
              <label>Workspace name<input autoFocus maxLength={60} value={workspaceDraft} onChange={event => setWorkspaceDraft(event.target.value)} placeholder="e.g. Acme Studio" /></label>
              <small>Preview only · this does not create a backend workspace.</small>
              <div className="sai-account-switcher__modal-actions"><button type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="button" disabled={!workspaceDraft.trim()} onClick={createWorkspace}>Create workspace</button></div>
            </section>
          </div>
        )}

        {ACCOUNT_SCREENS.has(screen) && <InstagramContextFilter accounts={accounts} selectedAccountId={selectedAccountId} onSelect={onSelect} />}
      </div>
    </>
  );
}
