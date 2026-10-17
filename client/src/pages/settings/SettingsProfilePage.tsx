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
        // Role display is supplementary; profile editing remains available if membership lookup fails.
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
  const email = profile?.email ?? session?.email ?? "—";

  return (
    <section className="card settings-panel settings-profile-panel">
      <div className="settings-panel-header">
        <div>
          <div className="settings-eyebrow">PERSONAL ACCOUNT</div>
          <h2>Profile</h2>
          <p className="muted small">Manage how your name and account details appear to teammates.</p>
        </div>
      </div>

      <div className="settings-profile-summary">
        <span className="settings-profile-avatar">
          {profile?.profilePictureUrl || session?.picture ? (
            <img src={profile?.profilePictureUrl ?? session?.picture} alt="" referrerPolicy="no-referrer" />
          ) : (
            initial
          )}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{displayName}</div>
          <div className="truncate text-sm text-subtle">{email}</div>
          {role && <StatusBadge tone="neutral" className="mt-1">{formatRole(role)}</StatusBadge>}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 muted small" role="status">Loading profile…</p>
      ) : error && !profile ? (
        <div className="mt-4 banner banner-error" role="alert">{error}</div>
      ) : (
        <form className="settings-form" onSubmit={(event) => void saveProfile(event)}>
          <div className="settings-form-grid">
            <Field label="First name" htmlFor="profile-first-name">
              <TextInput id="profile-first-name" value={firstName} maxLength={80} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
            </Field>
            <Field label="Last name" htmlFor="profile-last-name">
              <TextInput id="profile-last-name" value={lastName} maxLength={80} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
            </Field>
            <Field label="Email address" htmlFor="profile-email" hint="Managed by your sign-in identity provider.">
              <TextInput id="profile-email" value={email} readOnly aria-readonly="true" />
            </Field>
            <Field label="Workspace role" htmlFor="profile-role" hint={role ? "Your workspace membership controls this role." : "Workspace role is unavailable until membership data loads."}>
              <TextInput id="profile-role" value={role ? formatRole(role) : "—"} readOnly aria-readonly="true" />
            </Field>
          </div>

          <Field label="Profile image URL" htmlFor="profile-picture-url" hint="Optional. Use a public HTTPS image URL. Leave empty to remove the current image.">
            <TextInput id="profile-picture-url" type="url" value={pictureUrl} maxLength={2048} onChange={(event) => setPictureUrl(event.target.value)} placeholder="https://…" autoComplete="url" />
          </Field>

          {error && <p className="text-sm text-err-ink" role="alert">{error}</p>}
          {saved && <p className="text-sm text-ok-ink" role="status">Profile saved.</p>}
          <div>
            <Button type="submit" disabled={saving || loading}>{saving ? "Saving…" : "Save profile"}</Button>
          </div>
        </form>
      )}
    </section>
  );
}
