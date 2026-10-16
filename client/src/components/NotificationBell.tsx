import { useEffect, useState } from "react";
import { api, type InAppNotification } from "../api";
import { Button } from "./ui";

function ageLabel(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString();
}

export function NotificationBell({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInbox() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getNotifications(tenantId, 10);
      setItems(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadInbox();
    // Deliberately refresh only on open/workspace change; no polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId]);

  async function markRead(notificationId: string) {
    setSavingId(notificationId);
    setError(null);
    try {
      await api.markNotificationRead(tenantId, notificationId);
      setItems((current) => current.map((item) =>
        item.id === notificationId && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item));
      setUnreadCount((current) => Math.max(0, current - (items.some((item) => item.id === notificationId && !item.readAt) ? 1 : 0)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this notification as read.");
    } finally {
      setSavingId(null);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setError(null);
    try {
      await api.markAllNotificationsRead(tenantId);
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt: now }));
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark notifications as read.");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        disabled={!tenantId}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-subtle hover:bg-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4.5 w-4.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-err-ink px-1 text-[10px] font-semibold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close notifications" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <section role="dialog" aria-label="Notifications" className="absolute right-0 top-10 z-30 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-0 shadow-lg">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="m-0 text-base font-semibold text-ink">Notifications</h2>
                <p className="m-0 mt-0.5 text-xs text-subtle">{unreadCount} unread</p>
              </div>
              <Button size="sm" variant="ghost" disabled={unreadCount === 0 || markingAll || loading} onClick={() => void markAllRead()}>
                {markingAll ? "Marking…" : "Mark all read"}
              </Button>
            </header>
            {error && <p className="m-3 rounded-md border border-err px-3 py-2 text-sm text-err-ink" role="alert">{error}</p>}
            {loading ? (
              <p className="px-4 py-6 text-sm text-subtle" role="status">Loading notifications…</p>
            ) : items.length === 0 && !error ? (
              <div className="px-4 py-8 text-center">
                <p className="m-0 text-sm font-medium text-ink">You're all caught up</p>
                <p className="m-0 mt-1 text-sm text-subtle">Important workspace events will appear here.</p>
              </div>
            ) : (
              <ul className="m-0 max-h-[min(28rem,65vh)] list-none divide-y divide-line overflow-y-auto p-0">
                {items.map((item) => (
                  <li key={item.id} className={`px-4 py-3 ${item.readAt ? "" : "bg-chip/40"}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-line-strong" : item.severity === "critical" ? "bg-err" : "bg-accent"}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-sm font-medium text-ink">{item.title}</p>
                        <p className="m-0 mt-1 whitespace-normal break-words text-sm leading-5 text-subtle">{item.message}</p>
                        <p className="m-0 mt-1 text-xs text-subtle">{ageLabel(item.createdAt)}</p>
                      </div>
                      {!item.readAt && <button type="button" aria-label={`Mark ${item.title} as read`} className="rounded px-2 py-1 text-xs font-medium text-accent hover:bg-chip focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50" disabled={savingId === item.id} onClick={() => void markRead(item.id)}>{savingId === item.id ? "Saving…" : "Mark read"}</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <footer className="border-t border-line px-4 py-3">
              <a href={`/dashboard/${tenantId}/settings`} onClick={() => setOpen(false)} className="text-sm font-medium text-accent underline-offset-2 hover:underline">Notification settings</a>
            </footer>
          </section>
        </>
      )}
    </div>
  );
}
