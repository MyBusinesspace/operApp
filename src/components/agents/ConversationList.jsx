import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Check, Pencil, X } from "lucide-react";

const AGENT_NAME = "operations_assistant";
const NAMES_KEY = "operations_assistant_conv_names";

function loadNameOverrides() {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY) || "{}"); } catch { return {}; }
}
function saveNameOverrides(map) {
  localStorage.setItem(NAMES_KEY, JSON.stringify(map));
}
function displayName(conv, overrides) {
  const id = conv?.id;
  if (id && overrides[id]) return overrides[id];
  return conv?.metadata?.name || conv?.title || "Untitled";
}

export default function ConversationList({ activeId, onSelect, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.agents.listConversations({ agent_name: AGENT_NAME });
      setConversations(list || []);
      setOverrides(loadNameOverrides());
    } catch (e) {
      console.error("listConversations error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRename = (id) => {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    const next = { ...overrides, [id]: name };
    setOverrides(next);
    saveNameOverrides(next);
    setEditingId(null);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-card animate-fade-in">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
        <p className="text-sm font-semibold text-foreground">Conversations</p>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50" title="Back to chat">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : conversations.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground text-center">No conversations yet.</p>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map(c => {
              const name = displayName(c, overrides);
              const isActive = c.id === activeId;
              const isEditing = editingId === c.id;
              return (
                <div key={c.id} className={`group flex items-center gap-1.5 rounded-lg px-2 py-2 ${isActive ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/40 border border-transparent"}`}>
                  {isEditing ? (
                    <>
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleRename(c.id); if (e.key === "Escape") setEditingId(null); }}
                        className="flex-1 min-w-0 text-xs bg-transparent border border-input rounded px-1.5 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <button onClick={() => handleRename(c.id)} className="w-6 h-6 flex items-center justify-center rounded text-primary hover:bg-primary/10" title="Save"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingId(null)} className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted/50" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => onSelect(c)} className="flex-1 min-w-0 text-left">
                        <p className={`text-xs truncate ${isActive ? "font-semibold text-primary" : "text-foreground"}`}>{name}</p>
                      </button>
                      <button
                        onClick={() => { setEditingId(c.id); setEditName(name); }}
                        className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 opacity-0 group-hover:opacity-100"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-border bg-muted/10 shrink-0">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Renames are saved on this browser. Deleting conversations isn't supported by the platform yet.
        </p>
      </div>
    </div>
  );
}