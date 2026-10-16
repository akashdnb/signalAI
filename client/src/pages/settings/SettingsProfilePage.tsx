import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { loadSession } from "../../api";
import { workspaceApi, type WorkspaceRole } from "../../api/workspace";
import { deriveDisplayName } from "../../lib/leadFormatting";
import { StatusBadge } from "../../components/ui";

function formatRole(role: WorkspaceRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Visual shell, same reasoning as SettingsGeneralPage — no profile-update
 * API exists yet. The workspace role shown is real (looked up from the
 * member list by email), not fabricated.
 */
export function SettingsProfilePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const session = loadSession();
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [displayName, setDisplayName] = useState(
    () => [session?.firstName, session?.lastName].filter(Boolean).join(" ") || deriveDisplayName(session?.email),
  );

  useEffect(() => {
    if (!tenantId || !session?.email) return;
    let cancelled = false;
    workspaceApi
      .listMembers(tenantId)
      .then((members) => {
        if (cancelled) return;
        const self = members.find((m) => m.email.toLowerCase() === session.email!.toLowerCase());
        if (self) setRole(self.role);
      })
      .catch(() => {
        // Role display degrades gracefully — not a page-blocking error.
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, session?.email]);

  const initial = (session?.firstName?.charAt(0) || session?.email?.charAt(0) || "?").toUpperCase();

  return (
    <section className="card">
      <h2>Profile</h2>
      <p className="muted small">Manage how your name and account details appear to teammates.</p>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-line p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-base font-semibold text-white">
          {session?.picture ? (
            <img src={session.picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{displayName}</div>
          <div className="truncate text-sm text-subtle">{session?.email ?? "—"}</div>
          {role && (
            <StatusBadge tone="neutral" className="mt-1">
              {formatRole(role)}
            </StatusBadge>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Display name</span>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink">Email address</span>
          <input type="email" value={session?.email ?? ""} disabled />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary btn-small">
          Save profile
        </button>
        <span className="muted small">Profile edits can&rsquo;t be saved yet — there&rsquo;s no update API for this.</span>
      </div>
    </section>
  );
}
