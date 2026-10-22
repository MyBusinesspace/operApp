import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2, Sparkles, X, Plus, MessageSquare, Paperclip, FileText } from "lucide-react";
import MessageBubble from "@/components/agents/MessageBubble";
import ConversationList from "@/components/agents/ConversationList";
import { useAgentPanel } from "@/lib/AgentPanelContext";

const AGENT_NAME = "operations_assistant";
const STORAGE_KEY = "operations_assistant_active_conv";

const SUGGESTIONS = [
  "Where are my workers right now?",
  "Who is clocked in today?",
  "Create a draft invoice for 5000 AED linked to a project",
  "Which workers are scheduled but not clocked in?",
];

export default function AgentPanel() {
  const { close } = useAgentPanel();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  // Restore the last active conversation (remembered across close/reopen)
  const initConversation = useCallback(async () => {
    setLoading(true);
    try {
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        try {
          const full = await base44.agents.getConversation(savedId);
          if (full?.id) {
            setConversation(full);
            setMessages(full?.messages || []);
            return;
          }
        } catch { /* stale id — fall through to list */ }
      }
      const list = await base44.agents.listConversations({ agent_name: AGENT_NAME });
      if (list?.length) {
        const conv = list[0];
        setConversation(conv);
        localStorage.setItem(STORAGE_KEY, conv.id);
        const full = await base44.agents.getConversation(conv.id);
        setMessages(full?.messages || []);
      } else {
        const conv = await base44.agents.createConversation({
          agent_name: AGENT_NAME,
          metadata: { name: "Operations chat", description: "Operations assistant" },
        });
        setConversation(conv);
        localStorage.setItem(STORAGE_KEY, conv.id);
        setMessages([]);
      }
    } catch (e) {
      console.error("AgentPanel init error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { initConversation(); }, [initConversation]);

  // Subscribe to conversation updates
  useEffect(() => {
    if (!conversation?.id) return;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data?.messages || []);
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [conversation?.id]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleNewChat = async () => {
    try {
      const conv = await base44.agents.createConversation({
        agent_name: AGENT_NAME,
        metadata: { name: `Chat ${new Date().toLocaleString()}`, description: "Operations assistant" },
      });
      setConversation(conv);
      setMessages([]);
      localStorage.setItem(STORAGE_KEY, conv.id);
      setShowList(false);
    } catch (e) {
      console.error("createConversation error", e);
    }
  };

  const handleSelectConversation = async (conv) => {
    setShowList(false);
    setLoading(true);
    try {
      const full = await base44.agents.getConversation(conv.id);
      setConversation(full);
      setMessages(full?.messages || []);
      localStorage.setItem(STORAGE_KEY, full.id);
    } catch (e) {
      console.error("selectConversation error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || sending || uploading || !conversation) return;
    setSending(true);
    setInput("");

    // Upload pending files and get signed URLs for the agent to read
    let fileUrls = [];
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        for (const file of pendingFiles) {
          const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
          const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
          fileUrls.push(signed_url);
        }
      } catch (err) {
        console.error("File upload error", err);
        setInput(text);
        setSending(false);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const filesToSend = pendingFiles;
    setPendingFiles([]);

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content: text || "(See attached file)",
        ...(fileUrls.length > 0 ? { file_urls: fileUrls } : {}),
      });
    } catch (err) {
      console.error("addMessage error", err);
      setInput(text);
      setPendingFiles(filesToSend);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-card border-r border-border">
      {showList && (
        <ConversationList
          activeId={conversation?.id}
          onSelect={handleSelectConversation}
          onClose={() => setShowList(false)}
        />
      )}
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between bg-muted/20 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">Operations Assistant</p>
            <p className="text-[10px] text-muted-foreground truncate">Drafts docs · tracks workers</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowList(true)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            title="Conversations"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleNewChat}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={close}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-background min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground">Ask me to draft a quote/invoice/bill or track your workers.</p>
            <div className="flex flex-col gap-1.5 w-full">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-left text-[11px] px-2.5 py-2 rounded-lg border border-border bg-card hover:bg-muted/40 text-foreground"
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
      <form onSubmit={handleSend} className="p-2.5 border-t border-border bg-card shrink-0">
        {/* Pending file attachments */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((f, idx) => (
              <div key={idx} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
                <FileText className="w-3 h-3 text-primary shrink-0" />
                <span className="truncate max-w-[140px]">{f.name}</span>
                <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)}KB</span>
                <button
                  type="button"
                  onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files);
            if (files.length) setPendingFiles(prev => [...prev, ...files]);
            e.target.value = "";
          }}
        />
        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border border-input text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50"
            title="Attach PDF or image"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            rows={3}
            placeholder="Ask the assistant…"
            className="flex-1 resize-y rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-h-48 min-h-[80px]"
          />
          <button
            type="submit"
            disabled={sending || uploading || (!input.trim() && pendingFiles.length === 0)}
            className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
}