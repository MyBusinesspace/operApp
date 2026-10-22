import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Plus, MessageSquare, Loader2, Sparkles } from "lucide-react";
import MessageBubble from "@/components/agents/MessageBubble";

const AGENT_NAME = "operations_assistant";

const SUGGESTIONS = [
  "Create a draft invoice for project Acme Tower maintenance, 5000 AED, link to the project",
  "Where is worker John right now?",
  "Who is clocked in today and which projects are they on?",
  "Create a draft bill from supplier Desert Supplies for 1200 AED linked to the Marina project",
];

export default function AgentAssistant() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef(null);

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await base44.agents.listConversations({ agent_name: AGENT_NAME });
      setConversations(list || []);
      if (!activeId && list?.length) setActiveId(list[0].id);
    } catch (e) {
      console.error("listConversations error", e);
    } finally {
      setLoadingList(false);
    }
  }, [activeId]);

  useEffect(() => { loadConversations(); }, []);

  // Subscribe to active conversation
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    // Load full history first
    base44.agents.getConversation(activeId).then(c => {
      setMessages(c?.messages || []);
    }).catch(() => setMessages([]));

    const unsubscribe = base44.agents.subscribeToConversation(activeId, (data) => {
      setMessages(data?.messages || []);
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [activeId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleNewConversation = async () => {
    setCreating(true);
    try {
      const conv = await base44.agents.createConversation({
        agent_name: AGENT_NAME,
        metadata: { name: "New conversation", description: "Operations assistant" },
      });
      setConversations(prev => [conv, ...prev]);
      setActiveId(conv.id);
      setMessages([]);
    } catch (e) {
      console.error("createConversation error", e);
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    if (!activeId) {
      // create a conversation on the fly
      await handleNewConversation();
    }
    setSending(true);
    setInput("");
    try {
      const conv = conversations.find(c => c.id === activeId) ||
        await base44.agents.getConversation(activeId);
      await base44.agents.addMessage(conv, { role: "user", content: text });
    } catch (err) {
      console.error("addMessage error", err);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const activeConversation = conversations.find(c => c.id === activeId);

  return (
    <div className="flex h-[calc(100vh-var(--nav-height))] border border-border rounded-xl overflow-hidden bg-card">
      {/* Sidebar — conversation list */}
      <aside className="w-64 shrink-0 border-r border-border bg-muted/20 flex flex-col">
        <div className="p-3 border-b border-border">
          <button
            onClick={handleNewConversation}
            disabled={creating}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingList ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-3">
              No conversations yet. Start a new chat.
            </p>
          ) : (
            conversations.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                  c.id === activeId ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="truncate">{c.metadata?.name || "Conversation"}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-2 bg-muted/20">
          <Sparkles className="w-4 h-4 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {activeConversation?.metadata?.name || "Operations Assistant"}
            </p>
            <p className="text-[11px] text-muted-foreground">Drafts quotes, invoices & bills · tracks worker activity</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-background">
          {!activeId ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Operations Assistant</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Ask me to draft a quote, invoice or bill linked to a project, or to track where your workers are today.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-lg mt-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => { handleNewConversation(); setTimeout(() => setInput(s), 300); }}
                    className="text-left text-sm px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <p className="text-sm text-muted-foreground">Send a message to start.</p>
              <div className="flex flex-col gap-2 w-full max-w-lg">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-left text-sm px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-muted/40 text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, idx) => <MessageBubble key={idx} message={m} />)
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-4 border-t border-border bg-card">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              rows={1}
              placeholder="Ask the assistant…  (e.g. create a draft quote for project X)"
              className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-h-32"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}