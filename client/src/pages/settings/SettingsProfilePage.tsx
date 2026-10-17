import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, loadSession, type UserProfile } from "../../api";
import { workspaceApi, type WorkspaceRole } from "../../api/workspace";
import { deriveDisplayName } from "../../lib/leadFormatting";
import { Button, Field, StatusBadge, TextInput } from "../../components/ui";

function formatRole(role: WorkspaceRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function SettingsProfilePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const session = loadSession();
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pictureUrl, setPictureUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile()
      .then((result) => {
        if (cancelled) return;
        setProfile(result);
        setFirstName(result.firstName ?? "");
        setLastName(result.lastName ?? "");
        setPictureUrl(result.profilePictureUrl ?? "");
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await api.updateProfile({
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        profilePictureUrl: pictureUrl.trim() || null,
      });
      setProfile(updated);
      setFirstName(updated.firstName ?? "");
      setLastName(updated.lastName ?? "");
      setPictureUrl(updated.profilePictureUrl ?? "");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const displayName = [firstName, lastName].filter(Boolean).join(" ") || deriveDisplayName(profile?.email ?? session?.email);
  const initial = (firstName?.charAt(0) || profile?.email?.charAt(0) || session?.email?.charAt(0) || "?").toUpperCase();

  return (
    <section className="card">
      <h2>Profile</h2>
      <p className="muted small">Update how your name and profile image appear to teammates. Your sign-in email is managed by your identity provider.</p>

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
          <div className="truncate text-sm text-subtle">{profile?.email ?? session?.email ?? "—"}</div>
          {role && (
            <StatusBadge tone="neutral" className="mt-1">
              {formatRole(role)}
            </StatusBadge>
          )}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 muted small" role="status">Loading profile…</p>
      ) : error && !profile ? (
        <div className="mt-4 banner banner-error" role="alert">{error}</div>
      ) : (
        <form className="mt-4 max-w-2xl space-y-4" onSubmit={(event) => void saveProfile(event)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="profile-first-name">
              <TextInput id="profile-first-name" value={firstName} maxLength={80} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
            </Field>
            <Field label="Last name" htmlFor="profile-last-name">
              <TextInput id="profile-last-name" value={lastName} maxLength={80} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Profile image URL" htmlFor="profile-picture-url" hint="Optional. Use a public HTTPS image URL. Leave empty to remove the current image.">
            <TextInput id="profile-picture-url" type="url" value={pictureUrl} maxLength={2048} onChange={(event) => setPictureUrl(event.target.value)} placeholder="https://…" autoComplete="url" />
          </Field>
          {error && <p className="text-sm text-err-ink" role="alert">{error}</p>}
          {saved && <p className="text-sm text-ok-ink" role="status">Profile saved.</p>}
          <Button type="submit" disabled={saving || loading}>{saving ? "Saving…" : "Save profile"}</Button>
        </form>
      )}
    </section>
  );
}
