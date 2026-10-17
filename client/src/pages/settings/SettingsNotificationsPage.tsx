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
    <section className="card settings-panel settings-notifications-panel">
      <div className="settings-panel-header">
        <div>
          <div className="settings-eyebrow">PERSONAL PREFERENCES</div>
          <h2>Notifications</h2>
          <p className="muted small">Choose which updates are important enough to bring to your attention.</p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 muted small" role="status">Loading notification preferences…</p>
      ) : error && events.length === 0 ? (
        <div className="mt-4 banner banner-error" role="alert">{error}</div>
      ) : (
        <>
          <p className="settings-notification-recipient">Email notifications go to <strong>{emailAddress}</strong>. Each event keeps its real in-app and email availability from the workspace API.</p>

          <div className="settings-notification-list">
            {events.map((event) => (
              <article className="settings-notification-row" key={event.type}>
                <div className="min-w-0">
                  <h3>{event.label}</h3>
                  <p>{event.description}</p>
                </div>
                <div className="settings-notification-channels" aria-label={`${event.label} channels`}>
                  {(["in_app", "email"] as NotificationChannel[]).map((channelType) => {
                    const channel = event.channels.find((item) => item.type === channelType);
                    if (!channel) return null;
                    return channel.available ? (
                      <label className="settings-notification-toggle" key={channelType}>
                        <input
                          type="checkbox"
                          checked={channel.enabled}
                          disabled={saving}
                          onChange={(eventChange) => toggle(event.type, channelType, eventChange.target.checked)}
                          aria-label={`${channel.label} for ${event.label}`}
                        />
                        <span>
                          <strong>{channel.label}</strong>
                          <small>{channel.enabled ? "On" : "Off"}</small>
                        </span>
                      </label>
                    ) : (
                      <span className="settings-notification-unavailable" key={channelType} title={channel.reason ?? undefined}>
                        <strong>{channel.label}</strong>
                        <small>Unavailable{channel.reason ? ` · ${channel.reason}` : ""}</small>
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
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
