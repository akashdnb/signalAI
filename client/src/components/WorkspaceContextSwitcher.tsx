import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { ErrorState } from "./ui/ErrorState";
import { Field, TextInput } from "./ui/Field";
import { LoadingState } from "./ui/LoadingState";
import { workspaceApi, type WorkspaceRole, type WorkspaceSummary } from "../api/workspace";
import { loadSession, saveSession } from "../api";
import { ChevronDownIcon } from "./icons";

function roleLabel(role: WorkspaceRole): string {
  switch (role) {
    case "owner": return "Owner";
    case "admin": return "Admin";
    case "member": return "Member";
  }
}

export function WorkspaceContextSwitcher({ accountContext }: { accountContext?: ReactNode }) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadWorkspaces() {
    try {
      const result = await workspaceApi.listWorkspaces();
      setWorkspaces(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your workspaces.");
      throw err;
    }
  }

  useEffect(() => {
    let cancelled = false;
    workspaceApi.listWorkspaces()
      .then((result) => {
        if (!cancelled) {
          setWorkspaces(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your workspaces.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const refresh = () => {
      void loadWorkspaces().catch(() => undefined);
    };
    window.addEventListener("signalai:workspaces-updated", refresh);
    return () => window.removeEventListener("signalai:workspaces-updated", refresh);
  }, []);

  const currentWorkspace = workspaces?.find((workspace) => workspace.tenantId === tenantId) ?? null;

  function switchWorkspace(next: WorkspaceSummary) {
    if (next.tenantId === tenantId) {
      setOpen(false);
      return;
    }
    const session = loadSession();
    if (session) saveSession({ ...session, tenantId: next.tenantId });
    setOpen(false);
    const currentBase = `/dashboard/${tenantId}`;
    const suffix = location.pathname.startsWith(currentBase) ? location.pathname.slice(currentBase.length) : "";
    navigate(`/dashboard/${next.tenantId}${suffix}`);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceName.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await workspaceApi.createWorkspace({
        name: workspaceName.trim(),
        ...(workspaceDescription.trim() ? { description: workspaceDescription.trim() } : {}),
      });
      const latest = await loadWorkspaces();
      const selected = latest.find((workspace) => workspace.tenantId === created.tenantId) ?? created;
      const session = loadSession();
      if (session) saveSession({ ...session, tenantId: selected.tenantId });
      setCreating(false);
      setOpen(false);
      setWorkspaceName("");
      setWorkspaceDescription("");
      navigate(`/dashboard/${selected.tenantId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the workspace.");
    } finally {
      setSaving(false);
    }
  }

  if (workspaces === null && !error) {
    return <div className="border-b border-line bg-card px-4 py-2 md:px-5"><LoadingState label="Loading workspaces…" className="min-h-12 py-2" /></div>;
  }

  if (error && (workspaces === null || workspaces.length === 0)) {
    return <div className="border-b border-line bg-card px-4 py-2 md:px-5"><ErrorState title="Workspace context unavailable" description={error} action={<Button size="sm" variant="secondary" onClick={() => void loadWorkspaces()}>Retry</Button>} className="min-h-12 py-2" /></div>;
  }

  return (
    <div className="relative z-20 border-b border-line bg-card px-4 py-2 md:px-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => { setOpen((value) => !value); setCreating(false); }}
          className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{currentWorkspace?.name ?? "Workspace access unavailable"}</span>
            <span className="block text-xs text-subtle">{currentWorkspace ? roleLabel(currentWorkspace.role) : "Confirm your access to continue"}</span>
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-subtle" />
        </button>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {accountContext}
          {currentWorkspace && <span className="shrink-0 text-xs text-subtle">{workspaces.length > 1 ? `${workspaces.length} workspaces` : "Workspace"}</span>}
        </div>
      </div>

      {error && workspaces.length > 0 && <p role="alert" className="mb-0 mt-2 text-sm text-err-ink">{error}</p>}

      {open && (
        <>
          <button type="button" aria-label="Close workspace menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Workspace switcher" className="absolute left-4 right-4 top-full z-30 mt-1 max-w-md rounded-xl border border-line bg-card p-3 shadow-lg sm:left-5 sm:right-auto sm:w-[22rem]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm font-semibold text-ink">Your workspaces</h2>
              <Button size="sm" variant="ghost" onClick={() => { setCreating((value) => !value); setError(null); }}>
                {creating ? "Back" : "New workspace"}
              </Button>
            </div>
            {creating ? (
              <form onSubmit={(event) => void handleCreate(event)} className="space-y-3">
                <Field label="Workspace name" htmlFor="workspace-create-name" hint="Choose a name your team will recognize.">
                  <TextInput id="workspace-create-name" value={workspaceName} maxLength={120} required onChange={(event) => setWorkspaceName(event.target.value)} placeholder="e.g. Creator Studio" />
                </Field>
                <Field label="Description (optional)" htmlFor="workspace-create-description">
                  <TextInput id="workspace-create-description" value={workspaceDescription} maxLength={500} onChange={(event) => setWorkspaceDescription(event.target.value)} placeholder="What is this workspace for?" />
                </Field>
                {error && <p role="alert" className="m-0 text-sm text-err-ink">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setCreating(false)} disabled={saving}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={!workspaceName.trim() || saving}>{saving ? "Creating…" : "Create workspace"}</Button>
                </div>
              </form>
            ) : (
              <>
                {workspaces.length === 0 ? (
                  <EmptyState title="No workspaces available" description="This account does not have workspace access yet." className="min-h-24 py-4" />
                ) : (
                  <ul className="m-0 list-none space-y-1 p-0">
                    {workspaces.map((workspace) => (
                      <li key={workspace.tenantId}>
                        <button
                          type="button"
                          onClick={() => switchWorkspace(workspace)}
                          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-chip ${workspace.tenantId === tenantId ? "bg-chip" : ""}`}
                          aria-current={workspace.tenantId === tenantId ? "page" : undefined}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">{workspace.name}</span>
                            <span className="block truncate text-xs text-subtle">{workspace.description || roleLabel(workspace.role)}</span>
                          </span>
                          <span className="shrink-0 text-xs text-subtle">{roleLabel(workspace.role)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {currentWorkspace && currentWorkspace.role === "member" && <p className="mb-0 mt-3 border-t border-line pt-3 text-xs leading-5 text-subtle">Your role allows workspace use, while workspace settings and membership management are restricted.</p>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
