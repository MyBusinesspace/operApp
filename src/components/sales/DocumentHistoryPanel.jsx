import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ChevronDown, ChevronUp, Plus, Clock, User, FileText, Trash2, ArrowRightLeft, Printer, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTION_ICONS = {
  "Created":               FileText,
  "Updated":               PenLine,
  "Status Changed":        ArrowRightLeft,
  "Deleted":               Trash2,
  "Note Added":            PenLine,
  "Printed":               Printer,
  "Converted to Invoice":  ArrowRightLeft,
};

const ACTION_COLORS = {
  "Created":               "text-emerald-600 bg-emerald-50",
  "Updated":               "text-blue-600 bg-blue-50",
  "Status Changed":        "text-violet-600 bg-violet-50",
  "Deleted":               "text-red-600 bg-red-50",
  "Note Added":            "text-slate-600 bg-slate-100",
  "Printed":               "text-slate-500 bg-slate-50",
  "Converted to Invoice":  "text-orange-600 bg-orange-50",
};

function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export async function logDocumentHistory({ docType, docId, docNumber, action, detail, userName, note }) {
  await base44.entities.DocumentHistory.create({
    doc_type: docType,
    doc_id: docId || null,
    doc_number: docNumber || "",
    action,
    detail: detail || "",
    user_name: userName || "Unknown",
    note: note || "",
  });
}

export default function DocumentHistoryPanel({ docType, docId, docNumber, refreshTrigger }) {
  const [entries, setEntries] = useState([]);
  const [expanded, setExpanded] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  const load = async () => {
    if (!docId && !docNumber) return;
    const filter = docId ? { doc_id: docId } : { doc_number: docNumber, doc_type: docType };
    const results = await base44.entities.DocumentHistory.filter(filter, "-created_date", 50).catch(() => []);
    setEntries(results);
  };

  useEffect(() => { load(); }, [docId, docNumber, refreshTrigger]);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    await logDocumentHistory({
      docType,
      docId,
      docNumber,
      action: "Note Added",
      detail: noteText.trim(),
      userName: currentUser?.full_name || currentUser?.email || "Unknown",
      note: noteText.trim(),
    });
    setNoteText("");
    setAddingNote(false);
    setSaving(false);
    load();
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
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{entries.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {expanded && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1 px-2"
              onClick={e => { e.stopPropagation(); setAddingNote(true); }}
            >
              <Plus className="w-3 h-3" /> Add Note
            </Button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-border">
          {/* Add note input */}
          {addingNote && (
            <div className="px-4 py-3 bg-muted/10 space-y-2">
              <textarea
                className="w-full min-h-[64px] rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
                placeholder="Add a note..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddingNote(false); setNoteText(""); }}>Cancel</Button>
                <Button type="button" size="sm" className="h-7 text-xs" disabled={saving || !noteText.trim()} onClick={handleAddNote}>
                  {saving ? "Saving..." : "Save Note"}
                </Button>
              </div>
            </div>
          )}

          {entries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">No history yet.</div>
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
                {entries.map(e => {
                  const Icon = ACTION_ICONS[e.action] || FileText;
                  const colorClass = ACTION_COLORS[e.action] || "text-slate-500 bg-slate-50";
                  return (
                    <tr key={e.id} className="border-t border-border hover:bg-muted/10 transition-colors">
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
                          {e.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-foreground max-w-[260px]">
                        {e.note ? (
                          <span className="italic text-muted-foreground">"{e.note}"</span>
                        ) : (
                          e.detail || "—"
                        )}
                      </td>
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