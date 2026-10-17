import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type NotificationChannel, type NotificationPreferenceEvent } from "../../api";
import { Button } from "../../components/ui";

export function SettingsNotificationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [events, setEvents] = useState<NotificationPreferenceEvent[]>([]);
  const [emailAddress, setEmailAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    api
      .getNotificationPreferences(tenantId)
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setEmailAddress(result.recipient.email);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load notification preferences.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  function toggle(eventType: string, channel: NotificationChannel, enabled: boolean) {
    setSaved(false);
    setEvents((current) =>
      current.map((event) =>
        event.type !== eventType
          ? event
          : { ...event, channels: event.channels.map((item) => (item.type === channel ? { ...item, enabled } : item)) },
      ),
    );
  }

  async function savePreferences() {
    if (!tenantId) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const preferences = events.flatMap((event) =>
        event.channels
          .filter((channel) => channel.available)
          .map((channel) => ({ eventType: event.type, channel: channel.type, enabled: channel.enabled })),
      );
      await api.updateNotificationPreferences(tenantId, preferences);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  if (!tenantId) return null;

  return (
    <section className="card">
      <h2>Notifications</h2>
      <p className="muted small">Choose which SignalAI events appear in your inbox and which should be emailed to your sign-in address.</p>

      {loading ? (
        <p className="mt-4 muted small" role="status">Loading notification preferences…</p>
      ) : error && events.length === 0 ? (
        <div className="mt-4 banner banner-error" role="alert">{error}</div>
      ) : (
        <>
          <p className="mt-4 muted small">Email recipient: {emailAddress}. In-app notifications are enabled by default. Email settings are saved for this workspace and your account.</p>
          <div className="mt-3 w-full overflow-x-auto">
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
    </section>
  );
}
