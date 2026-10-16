import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { FieldDefinitionsPanel } from "../components/FieldDefinitionsPanel";
import { GuardrailsConfigPanel } from "../components/GuardrailsConfigPanel";
import { ScoringRulesPanel } from "../components/ScoringRulesPanel";
import { Button, Field, Section, TextInput } from "../components/ui";
import { api, type UserProfile, type NotificationChannel, type NotificationPreferenceEvent } from "../api";
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

function NotificationSettingsPanel({ tenantId }: { tenantId: string }) {
  const [events, setEvents] = useState<NotificationPreferenceEvent[]>([]);
  const [emailAddress, setEmailAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getNotificationPreferences(tenantId)
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setEmailAddress(result.recipient.email);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load notification preferences.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId]);

  function toggle(eventType: string, channel: NotificationChannel, enabled: boolean) {
    setSaved(false);
    setEvents((current) => current.map((event) => event.type !== eventType ? event : {
      ...event,
      channels: event.channels.map((item) => item.type === channel ? { ...item, enabled } : item),
    }));
  }

  async function savePreferences() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const preferences = events.flatMap((event) => event.channels
        .filter((channel) => channel.available)
        .map((channel) => ({ eventType: event.type, channel: channel.type, enabled: channel.enabled })));
      await api.updateNotificationPreferences(tenantId, preferences);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save notification preferences.");
    } finally { setSaving(false); }
  }

  return (
    <Section title="Notifications" description="Choose which SignalAI events appear in your inbox and which should be emailed to your sign-in address.">
      {loading ? (
        <p className="muted small" role="status">Loading notification preferences…</p>
      ) : error && events.length === 0 ? (
        <div className="banner banner-error" role="alert">{error}</div>
      ) : (
        <>
          <p className="muted small">Email recipient: {emailAddress}. In-app notifications are enabled by default. Email settings are saved for this workspace and your account.</p>
          <div className="w-full max-w-4xl overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="py-3 pr-4 font-medium">Event</th>
                  <th className="px-3 py-3 font-medium">In-app</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.type} className="border-b border-line last:border-b-0">
                    <th scope="row" className="py-3 pr-4 text-left align-top font-medium text-ink">
                      {event.label}
                      <p className="mt-1 max-w-xl text-xs font-normal leading-5 text-subtle">{event.description}</p>
                    </th>
                    {(["in_app", "email"] as NotificationChannel[]).map((channelType) => {
                      const channel = event.channels.find((item) => item.type === channelType)!;
                      return (
                        <td key={channelType} className="px-3 py-3 align-top">
                          {channel.available ? (
                            <label className="inline-flex min-h-8 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={channel.enabled}
                                disabled={saving}
                                onChange={(eventChange) => toggle(event.type, channelType, eventChange.target.checked)}
                                aria-label={`${channel.label} for ${event.label}`}
                                className="h-4 w-4 accent-accent"
                              />
                              <span className="text-xs text-subtle">{channel.enabled ? "On" : "Off"}</span>
                            </label>
                          ) : (
                            <span className="block max-w-44 text-xs text-subtle" title={channel.reason ?? undefined}>
                              Unavailable
                              <span className="mt-1 block leading-5">{channel.reason}</span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="mt-3 text-sm text-err-ink" role="alert">{error}</p>}
          {saved && <p className="mt-3 text-sm text-ok-ink" role="status">Notification preferences saved.</p>}
          <div className="mt-4">
            <Button onClick={() => void savePreferences()} disabled={saving}>
              {saving ? "Saving preferences…" : "Save notification preferences"}
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

export function SettingsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenant } = useTenant();

  if (!tenantId) return null;

  return (
    <div className="page page-wide">
      <h1>{tenant?.name ?? "Settings"}</h1>

      <ProfileSettingsPanel />
      <NotificationSettingsPanel tenantId={tenantId} />
      <FieldDefinitionsPanel tenantId={tenantId} />
      <GuardrailsConfigPanel tenantId={tenantId} />
      <ScoringRulesPanel tenantId={tenantId} />
    </div>
  );
}
