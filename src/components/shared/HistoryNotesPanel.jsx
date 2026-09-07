import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  ChevronDown, ChevronUp, Plus, Clock, User,
  MessageSquare, Phone, Mail, Users as UsersIcon, Calendar, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DEFAULT_ACTIONS = ["Note", "Call", "Email", "Meeting", "Update"];

const ACTION_ICONS = {
  Note: MessageSquare, Call: Phone, Email: Mail, Meeting: UsersIcon, Update: Calendar,
};
const ACTION_COLORS = {
  Note: "text-slate-600 bg-slate-100",
  Call: "text-blue-600 bg-blue-50",
  Email: "text-violet-600 bg-violet-50",
  Meeting: "text-emerald-600 bg-emerald-50",
  Update: "text-amber-600 bg-amber-50",
};

function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Reusable History & Notes panel — mirrors the Task history panel look.
 * Works with any "note" entity (AssetNote, ProjectNote, ContactNote, …).
 *
 * Props:
 *  - entityName: e.g. "AssetNote"
 *  - idField:    e.g. "asset_id"
 *  - recordId:  the parent record id
 *  - actionOptions: optional list of action types (defaults to Note/Call/Email/Meeting/Update)
 */
export default function HistoryNotesPanel({
  entityName, idField, recordId, actionOptions = DEFAULT_ACTIONS,
}) {
  const [entries, setEntries] = useState([]);
  const [expanded, setExpanded] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [form, setForm] = useState({ action: actionOptions[0] || "Note", note: "" });
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  const load = async () => {
    if (!recordId) { setEntries([]); return; }
    try {
      const results = await base44.entities[entityName].filter(
        { [idField]: recordId }, "-created_date", 50,
      );
      setEntries(results || []);
    } catch { setEntries([]); }
  };

  useEffect(() => { load(); }, [entityName, idField, recordId]);

  const handleAddNote = async () => {
    if (!form.note.trim()) return;
    setSaving(true);
    try {
      await base44.entities[entityName].create({
        [idField]: recordId,
        action: form.action,
        note: form.note.trim(),
        user_name: currentUser?.full_name || currentUser?.email || "",
      });
      setForm({ action: actionOptions[0] || "Note", note: "" });
      setAddingNote(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden mt-4">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">History & Notes</span>
          {entries.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
              {entries.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <Button
              type="button" size="sm" variant="outline"
              className="h-6 text-xs gap-1 px-2"
              onClick={e => { e.stopPropagation(); setForm({ action: actionOptions[0] || "Note", note: "" }); setAddingNote(true); }}
            >
              <Plus className="w-3 h-3" /> Add Note
            </Button>
          )}
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-border">
          {/* Add note input */}
          {addingNote && (
            <div className="px-4 py-3 bg-muted/10 space-y-2">
              <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v }))}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {actionOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <textarea
                className="w-full min-h-[64px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                placeholder="Add a note..."
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setAddingNote(false); setForm({ action: actionOptions[0] || "Note", note: "" }); }}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="h-7 text-xs"
                  disabled={saving || !form.note.trim()} onClick={handleAddNote}>
                  {saving ? "Saving..." : "Save Note"}
                </Button>
              </div>
            </div>
          )}

          {entries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">No history recorded yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/20">
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Date</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">User</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Action</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const Icon = ACTION_ICONS[e.action] || FileText;
                  const colorClass = ACTION_COLORS[e.action] || "text-slate-500 bg-slate-50";
                  return (
                    <tr key={e.id || i} className="border-t border-border hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmtDateTime(e.created_date)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 text-foreground">
                          <User className="w-3 h-3 text-muted-foreground" />
                          {e.user_name || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
                          <Icon className="w-3 h-3" />
                          {e.action || "Note"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-foreground max-w-[260px]">{e.note || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}