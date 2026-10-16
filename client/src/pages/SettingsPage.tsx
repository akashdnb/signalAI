import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FieldDefinitionsPanel } from "../components/FieldDefinitionsPanel";
import { GuardrailsConfigPanel } from "../components/GuardrailsConfigPanel";
import { ScoringRulesPanel } from "../components/ScoringRulesPanel";
import { Button, Field, Section, TextInput } from "../components/ui";
import { api, type UserProfile } from "../api";
import { useTenant } from "../context/TenantContext";

function ProfileSettingsPanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pictureUrl, setPictureUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getProfile()
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
    return () => { cancelled = true; };
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

  return (
    <Section title="Personal profile" description="Update how your name and profile image appear in SignalAI. Your sign-in email is managed by your identity provider.">
      {loading ? (
        <p className="muted small" role="status">Loading profile…</p>
      ) : error && !profile ? (
        <div className="banner banner-error" role="alert">{error}</div>
      ) : (
        <form className="max-w-2xl space-y-4" onSubmit={(event) => void saveProfile(event)}>
          {profile && <p className="muted small">Signed in as {profile.email}</p>}
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
    </Section>
  );
}

/** Workspace-wide captured-fact schema and AI guardrails remain tenant-scoped. */
export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenant } = useTenant();

  if (!tenantId) return null;

  return (
    <div className="page page-wide">
      <h1>{tenant?.name ?? "Settings"}</h1>

      <ProfileSettingsPanel />
      <FieldDefinitionsPanel tenantId={tenantId} />
      <GuardrailsConfigPanel tenantId={tenantId} />
      <ScoringRulesPanel tenantId={tenantId} />
    </div>
  );
}
