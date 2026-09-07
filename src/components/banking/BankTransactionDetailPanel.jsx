import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  X, CheckCircle2, Circle, ExternalLink, FileText,
  MessageSquare, Plus, Trash2, ArrowUpRight, ArrowDownLeft
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function BankTransactionDetailPanel({ tx, currency, onClose, onReconcileToggle, onEdit, onDelete }) {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  useEffect(() => {
    if (!tx?.id) return;
    setNotes([]);
    setNewNote("");
    setAddingNote(false);
    setShowRemoveConfirm(false);
  }, [tx?.id]);

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    const note = {
      id: Date.now().toString(),
      detail: newNote.trim(),
      created_date: new Date().toISOString(),
    };
    setNotes(prev => [note, ...prev]);
    setNewNote("");
    setAddingNote(false);
  };

  const handleDeleteNote = (note) => {
    setNotes(prev => prev.filter(n => n.id !== note.id));
  };

  if (!tx) return null;

  const isReceive = tx.type === "Receive Money";
  const isSpend = tx.type === "Spend Money";

  const sourceLink = tx.source_type === "Invoice"
    ? `/sales/invoices`
    : tx.source_type === "Bill"
    ? `/purchasing/bills`
    : null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md shadow-2xl bg-background border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {isReceive && <ArrowDownLeft className="w-4 h-4 text-success" />}
            {isSpend && <ArrowUpRight className="w-4 h-4 text-destructive" />}
            <span className="text-xs font-medium text-muted-foreground">{tx.type}</span>
          </div>
          <h2 className="text-base font-bold text-foreground leading-snug">{tx.description}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{tx.date}</p>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Amount block */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold tabular-nums">
                <span className={isReceive ? "text-success" : isSpend ? "text-destructive" : "text-foreground"}>
                  {isReceive ? "+" : isSpend ? "−" : ""}{num(tx.amount)} {currency}
                </span>
              </p>
              {tx.contact_name && <p className="text-sm text-muted-foreground mt-0.5">{tx.contact_name}</p>}
            </div>
            {/* Reconcile status badge — unreconciled can be toggled freely */}
            {tx.status !== "Reconciled" && (
              <button
                onClick={() => onReconcileToggle(tx)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border text-orange-500 border-orange-300 bg-orange-50 hover:bg-orange-100 transition-colors"
              >
                <Circle className="w-3.5 h-3.5" /> Mark Reconciled
              </button>
            )}
            {tx.status === "Reconciled" && (
              <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border text-success border-success/30 bg-success/5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled
              </span>
            )}
          </div>
        </div>

        {/* Reconciled — Remove & Redo block (Xero-style) */}
        {tx.status === "Reconciled" && (
          <div className="mx-5 my-4 rounded-lg border border-success/30 bg-success/5 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-success">This transaction has been reconciled</p>
                <p className="text-xs text-muted-foreground mt-0.5">To undo the reconciliation, click "Remove &amp; Redo".</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
            </div>
            {!showRemoveConfirm ? (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive text-xs h-8"
                onClick={() => setShowRemoveConfirm(true)}
              >
                Remove &amp; Redo
              </Button>
            ) : (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                <p className="text-xs font-medium text-destructive mb-2">Are you sure you want to remove this reconciliation? This cannot be easily undone.</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-destructive hover:bg-destructive/90 text-white"
                    onClick={() => { setShowRemoveConfirm(false); onReconcileToggle(tx); }}
                  >
                    Yes, Remove
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowRemoveConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Details */}
        <div className="px-5 py-4 border-b border-border space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Details</h3>
          {[
            { label: "Reference", value: tx.reference },
            { label: "Account", value: tx.account_name },
            { label: "Source", value: tx.source_type },
          ].map(({ label, value }) => value ? (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground text-right">{value}</span>
            </div>
          ) : null)}
        </div>

        {/* Linked document */}
        {tx.source_number && (
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Linked Document</h3>
            <div className="bg-muted/40 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-primary">{tx.source_number}</p>
              </div>
              {sourceLink && (
                <Link to={sourceLink} onClick={onClose} className="text-xs text-primary hover:underline flex items-center gap-1">
                  Open <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* History & Notes */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">History & Notes</h3>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setAddingNote(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Note
            </Button>
          </div>

          {addingNote && (
            <div className="mb-3">
              <textarea
                autoFocus
                rows={3}
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note…"
                className="w-full text-sm border border-border rounded-lg p-2.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2 mt-1.5">
                <Button size="sm" className="h-7 text-xs" onClick={handleAddNote} disabled={saving || !newNote.trim()}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingNote(false); setNewNote(""); }}>Cancel</Button>
              </div>
            </div>
          )}

          {notes.length === 0 && !addingNote ? (
            <p className="text-xs text-muted-foreground">No notes yet.</p>
          ) : (
            <div className="space-y-2">
              {notes.map(note => (
                <div key={note.id} className="bg-muted/40 rounded-lg p-3 group relative">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <MessageSquare className="w-3 h-3" />
                    <span className="font-medium">{note.user_name || note.action}</span>
                    <span>·</span>
                    <span>{fmtDateTime(note.created_date)}</span>
                  </div>
                  <p className="text-sm text-foreground">{note.detail}</p>
                  <button
                    onClick={() => handleDeleteNote(note)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="px-5 py-3 border-t border-border flex gap-2 shrink-0">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(tx)}>Edit</Button>
        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => { onDelete(tx); onClose(); }}>
          Delete
        </Button>
      </div>
    </div>
  );
}