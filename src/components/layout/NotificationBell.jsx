import React, { useState, useRef, useEffect } from "react";
import { Bell, X, Trash2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

function timeAgo(d) {
  const iso = typeof d === "string" && !/[zZ]|[+-]\d\d:?\d\d$/.test(d) ? d + "Z" : d;
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

// In-app bell. Each user only sees (and can delete) their own notifications.
export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60000,
    queryFn: () => base44.entities.Notification.filter({ user_id: user.id }, "-created_date", 30),
  });
  const unread = items.filter((n) => !n.read).length;

  // Pop-up for newly arrived unread notifications (e.g. "time to clock in" reminders).
  // Ids already popped are remembered per user so each notice pops only once.
  const [popupItems, setPopupItems] = useState([]);
  useEffect(() => {
    if (!user?.id || !items.length) return;
    const key = `notif_seen_${user.id}`;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) {}
    const fresh = items.filter((n) => !n.read && !seen.includes(n.id));
    if (fresh.length) {
      setPopupItems(fresh);
      const next = [...seen, ...fresh.map((n) => n.id)].slice(-300);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch (e) {}
    }
  }, [items, user?.id]);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  const openItem = async (n) => {
    if (!n.read) { try { await base44.entities.Notification.update(n.id, { read: true }); } catch (e) {} refresh(); }
    setOpen(false);
    if (n.link) navigate(n.link);
  };
  const remove = async (e, n) => {
    e.stopPropagation();
    try { await base44.entities.Notification.delete(n.id); } catch (err) {}
    refresh();
  };
  const clearAll = async () => {
    for (const n of items) { try { await base44.entities.Notification.delete(n.id); } catch (e) {} }
    refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Bell className="w-4.5 h-4.5" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl border border-border bg-popover shadow-xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">Notifications</span>
            {items.length > 0 && (
              <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications</div>
            ) : items.map((n) => (
              <div
                key={n.id}
                onClick={() => openItem(n)}
                className={`flex gap-2 px-3 py-2.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-accent ${n.read ? "opacity-70" : ""}`}
              >
                <Clock className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {n.title}
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
                  </div>
                  {n.message && <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>}
                  <div className="text-[11px] text-muted-foreground mt-1">{timeAgo(n.created_date)}</div>
                </div>
                <button onClick={(e) => remove(e, n)} aria-label="Delete notification" className="p-1 h-fit rounded hover:bg-background text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {popupItems.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[90vw] rounded-xl border border-border bg-popover shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">New notification</span>
            <button onClick={() => setPopupItems([])} aria-label="Close" className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {popupItems.map((n) => (
              <div
                key={n.id}
                onClick={() => { setPopupItems((cur) => cur.filter((x) => x.id !== n.id)); openItem(n); }}
                className="flex gap-2 px-3 py-2.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-accent"
              >
                <Clock className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.message && <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
