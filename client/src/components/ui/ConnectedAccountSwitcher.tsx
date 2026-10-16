import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircleIcon, ChevronDownIcon } from "../icons";
import "./ConnectedAccountSwitcher.css";

export type ConnectedAccountSwitcherOption = { id: string; handle: string; label: string; connected?: boolean };
export type ConnectedAccountSwitcherWorkspace = { tenantId: string; name: string; description: string | null; role: "owner" | "admin" | "member" };
export type ConnectedAccountSwitcherProps = {
  workspaceName: string;
  providerLabel: string;
  providerIcon: ReactNode;
  accounts: ConnectedAccountSwitcherOption[];
  accountsLoading?: boolean;
  selectedAccountId: string;
  onSelect: (accountId: string) => void;
  onManageAccounts?: () => void;
  previewOnly?: boolean;
  workspaces?: ConnectedAccountSwitcherWorkspace[];
  currentWorkspaceId?: string;
  currentRole?: "owner" | "admin" | "member";
  workspacesLoading?: boolean;
  workspaceError?: string | null;
  onWorkspaceSelect?: (workspace: ConnectedAccountSwitcherWorkspace) => void;
  onCreateWorkspace?: (name: string, description: string) => Promise<void>;
  realMode?: boolean;
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
export function ConnectedAccountSwitcher({
  workspaceName,
  accounts,
  accountsLoading = false,
  selectedAccountId,
  onSelect,
  providerLabel,
  providerIcon,
  onManageAccounts,
  previewOnly = false,
  workspaces = [],
  currentWorkspaceId,
  currentRole,
  workspacesLoading = false,
  workspaceError = null,
  onWorkspaceSelect,
  onCreateWorkspace,
  realMode = false,
}: ConnectedAccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The precision-operations preview deliberately uses isolated sample data.
  // Keep it behind an explicit previewOnly prop; production uses server results.
  const selectedPreviewWorkspace = previewOnly ? (WORKSPACES.find(workspace => workspace.id === new URLSearchParams(window.location.search).get("workspace")) ?? WORKSPACES[0]!) : null;
  const selectedRealWorkspace = workspaces.find(workspace => workspace.tenantId === currentWorkspaceId);
  const selectedName = realMode ? (selectedRealWorkspace?.name ?? workspaceName) : (selectedPreviewWorkspace?.name ?? workspaceName);
  const selectedRole = realMode ? (currentRole ?? selectedRealWorkspace?.role) : undefined;

  useEffect(() => {
    if (!open) return;
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setCreateOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  const selectPreviewWorkspace = (workspace: Workspace) => {
    if (previewOnly) updatePreviewQuery({ workspace: workspace.id });
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  async function submitCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onCreateWorkspace || !newWorkspaceName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await onCreateWorkspace(newWorkspaceName.trim(), newWorkspaceDescription.trim());
      setNewWorkspaceName("");
      setNewWorkspaceDescription("");
      setCreateOpen(false);
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create workspace.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="sai-account-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="sai-account-switcher__trigger"
        aria-label={`Switch workspace. Current workspace ${selectedName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="sai-workspace-menu"
        onClick={() => setOpen(value => !value)}
      >
        <span className="sai-account-switcher__provider-chip" aria-hidden="true">{selectedName.slice(0, 2).toUpperCase()}</span>
        <span className="sai-account-switcher__identity">
          <strong>{selectedName}</strong>
          <small>{realMode ? (selectedRole ? `${selectedRole[0]!.toUpperCase()}${selectedRole.slice(1)} workspace` : "Workspace") : "Workspace"}</small>
        </span>
        <ChevronDownIcon className="sai-account-switcher__chevron" aria-hidden="true" />
      </button>
      {open && (
        <div id="sai-workspace-menu" className="sai-account-switcher__panel" role="dialog" aria-label="Workspace and account context">
          <div className="sai-account-switcher__panel-heading">
            <div><strong>{realMode ? "Your workspaces" : "Switch workspace"}</strong><small>{realMode ? "Only workspaces you belong to are listed." : "Sample workspace context for the UI preview."}</small></div>
          </div>
          {realMode ? (
            <>
              {workspacesLoading ? <p className="sai-account-switcher__message" role="status">Loading workspaces…</p> : null}
              {workspaceError ? <p className="sai-account-switcher__message sai-account-switcher__message--error" role="alert">{workspaceError}</p> : null}
              {!workspacesLoading && !workspaceError && workspaces.length === 0 ? <p className="sai-account-switcher__message">No workspaces are available to this account.</p> : null}
              <div className="sai-account-switcher__options">
                {workspaces.map(workspace => (
                  <button key={workspace.tenantId} type="button" role="menuitemradio" aria-checked={workspace.tenantId === currentWorkspaceId}
                    className={"sai-account-switcher__option" + (workspace.tenantId === currentWorkspaceId ? " is-selected" : "")}
                    onClick={() => { onWorkspaceSelect?.(workspace); setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); }}>
                    <span className="sai-account-switcher__option-icon" aria-hidden="true">{workspace.name.slice(0, 2).toUpperCase()}</span>
                    <span className="sai-account-switcher__option-copy"><strong>{workspace.name}</strong><small>{workspace.role[0]!.toUpperCase() + workspace.role.slice(1)}{workspace.description ? ` · ${workspace.description}` : ""}</small></span>
                    {workspace.tenantId === currentWorkspaceId && <CheckCircleIcon className="sai-account-switcher__selected-icon" aria-hidden="true" />}
                  </button>
                ))}
              </div>
              {onCreateWorkspace && (
                <div className="sai-account-switcher__create">
                  {!createOpen ? <button type="button" className="sai-account-switcher__create-trigger" onClick={() => setCreateOpen(true)}>+ Create workspace</button> : (
                    <form onSubmit={(event) => void submitCreateWorkspace(event)} className="sai-account-switcher__create-form">
                      <label>Workspace name<input autoFocus required maxLength={80} value={newWorkspaceName} onChange={event => setNewWorkspaceName(event.target.value)} placeholder="e.g. Creator Studio" /></label>
                      <label>Description (optional)<input maxLength={240} value={newWorkspaceDescription} onChange={event => setNewWorkspaceDescription(event.target.value)} placeholder="What is this workspace for?" /></label>
                      {createError && <p role="alert" className="sai-account-switcher__message sai-account-switcher__message--error">{createError}</p>}
                      <div className="sai-account-switcher__create-actions">
                        <button type="button" className="sai-account-switcher__cancel" disabled={creating} onClick={() => { setCreateOpen(false); setCreateError(null); }}>Cancel</button>
                        <button type="submit" className="sai-account-switcher__submit" disabled={creating || !newWorkspaceName.trim()}>{creating ? "Creating…" : "Create workspace"}</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="sai-account-switcher__options">
              {previewOnly && WORKSPACES.map(workspace => <button key={workspace.id} type="button" role="menuitemradio" aria-checked={workspace.id === selectedPreviewWorkspace.id} className={"sai-account-switcher__option" + (workspace.id === selectedPreviewWorkspace.id ? " is-selected" : "")} onClick={() => selectPreviewWorkspace(workspace)}>
                <span className="sai-account-switcher__option-icon" aria-hidden="true">{workspace.initials}</span>
                <span className="sai-account-switcher__option-copy"><strong>{workspace.name}</strong><small>{workspace.description}</small></span>
                {workspace.id === selectedPreviewWorkspace.id && <CheckCircleIcon className="sai-account-switcher__selected-icon" aria-hidden="true" />}
              </button>)}
            </div>
          )}
          {realMode && (
            <div className="sai-account-switcher__accounts">
              <div className="sai-account-switcher__accounts-heading"><strong>{providerLabel}</strong><button type="button" onClick={() => { setOpen(false); onManageAccounts?.(); }}>Manage</button></div>
              {accountsLoading ? <p className="sai-account-switcher__message" role="status">Loading Instagram accounts…</p> : accounts.length === 0 ? <p className="sai-account-switcher__message">No Instagram accounts are connected to this workspace.</p> : (
                <label className="sai-account-switcher__account-select"><span>Current account context</span><select aria-label="Current Instagram account context" value={selectedAccountId || "all"} onChange={event => onSelect(event.target.value)}><option value="all">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.handle}{account.connected === false ? " · Needs attention" : ""}</option>)}</select></label>
              )}
              <p className="sai-account-switcher__message">This selects the account context in the shell. It does not filter records on pages that do not yet support account-scoped queries.</p>
              {currentRole === "member" && <p className="sai-account-switcher__message">Your role allows viewing accounts. Workspace admins manage connections.</p>}
            </div>
          )}
          {previewOnly && !realMode && <div className="sai-account-switcher__preview-account-hint">{providerIcon} {providerLabel} accounts here are example data.</div>}
        </div>
      )}
    </div>
  );
}
