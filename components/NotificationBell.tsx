"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api-client";
import { useAuthStore } from "@/lib/store";

// GET /notifications shape (MA4) — not in frozen shared types, local to the UI
interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const unread = items.filter((n) => !n.readAt).length;

  const load = useCallback(async (markRead: boolean) => {
    setLoading(true);
    try {
      const list = await api<NotificationItem[]>("/api/v1/notifications");
      setItems(list);
      if (markRead) {
        const unreadIds = list.filter((n) => !n.readAt).map((n) => n.id);
        if (unreadIds.length > 0) {
          try {
            await api("/api/v1/notifications/read", {
              method: "PATCH",
              body: JSON.stringify({ ids: unreadIds }),
            });
            setItems(list.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
          } catch {
            // badge just stays until next open — bell is non-critical UI
          }
        }
      }
    } catch {
      // silent degradation: bell must never break the page
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      // initial badge load without marking anything read
      load(false);
    }
  }, [user, load]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    load(true);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 text-sm transition hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 bg-zinc-50/75 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
              Notifications
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading && items.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-zinc-500">Loading…</div>
              )}
              {!loading && items.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-zinc-500">
                  Nothing yet — application and certificate updates land here.
                </div>
              )}
              {items.map((n) => (
                <div
                  key={n.id}
                  className={`border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800 ${
                    n.readAt ? "" : "bg-blue-50/50 dark:bg-blue-950/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">{n.title}</span>
                    {!n.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">{n.body}</p>
                  <span className="mt-1 block text-[10px] text-zinc-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
