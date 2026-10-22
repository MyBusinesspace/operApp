import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, XCircle, Wrench, FileText } from "lucide-react";

const STATUS_META = {
  pending: { label: "Queued", icon: Loader2, spin: true, cls: "text-muted-foreground" },
  running: { label: "Running", icon: Loader2, spin: true, cls: "text-amber-500" },
  in_progress: { label: "Running", icon: Loader2, spin: true, cls: "text-amber-500" },
  completed: { label: "Done", icon: CheckCircle2, cls: "text-green-500" },
  success: { label: "Done", icon: CheckCircle2, cls: "text-green-500" },
  failed: { label: "Failed", icon: XCircle, cls: "text-red-500" },
  error: { label: "Error", icon: XCircle, cls: "text-red-500" },
};

function prettyJson(value) {
  if (value == null) return "";
  if (typeof value === "string") {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function FunctionDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const status = toolCall.status || "pending";
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  const failed = status === "failed" || status === "error";

  let parsedResults = toolCall.results;
  if (typeof parsedResults === "string") {
    try { parsedResults = JSON.parse(parsedResults); } catch { /* keep raw */ }
  }
  const resultIsError = parsedResults && typeof parsedResults === "object" &&
    (parsedResults.success === false || /error|failed/i.test(JSON.stringify(parsedResults)));
  const showAsFailed = failed || resultIsError;

  const proj = toolCall.display_projection || {};
  const hideDetails = proj.hide_details && proj.details_redacted;

  const name = toolCall.name || "tool";
  const args = prettyJson(toolCall.arguments_string);

  return (
    <div className="mt-2 border border-border rounded-lg bg-muted/30 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        {hideDetails ? (
          <span className={`flex items-center gap-1.5 font-medium ${showAsFailed ? "text-red-500" : meta.cls}`}>
            {showAsFailed ? (proj.error_label || "Failed") : (proj.active_label || proj.label || meta.label)}
          </span>
        ) : (
          <>
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-mono font-medium text-foreground">{name}</span>
            <span className={`flex items-center gap-1 ml-auto ${showAsFailed ? "text-red-500" : meta.cls}`}>
              <Icon className={`w-3.5 h-3.5 ${meta.spin ? "animate-spin" : ""}`} />
              {showAsFailed ? "Failed" : meta.label}
            </span>
          </>
        )}
      </button>
      {!hideDetails && expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border">
          {args && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Parameters</p>
              <pre className="font-mono text-[11px] text-foreground/80 whitespace-pre-wrap break-words">{args}</pre>
            </div>
          )}
          {parsedResults != null && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Result</p>
              <pre className="font-mono text-[11px] text-foreground/80 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{prettyJson(parsedResults)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "w-full max-w-[80%]"}`}>
        {message.content && (
          isUser ? (
            <div className="rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-sm">
              {message.content}
            </div>
          ) : (
            <div className="rounded-2xl rounded-bl-md bg-card border border-border px-4 py-3">
              <ReactMarkdown className="prose prose-sm max-w-none text-sm text-foreground prose-p:my-1 prose-ul:my-1 prose-li:my-0">{message.content}</ReactMarkdown>
            </div>
          )
        )}
        {message.file_urls?.length > 0 && (
          <div className={`mt-1.5 flex flex-wrap gap-1.5 ${isUser ? "justify-end" : ""}`}>
            {message.file_urls.map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${
                  isUser
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "bg-muted/40 text-foreground border border-border"
                }`}
              >
                <FileText className="w-3 h-3" />
                Attachment {idx + 1}
              </a>
            ))}
          </div>
        )}
        {message.tool_calls?.map((tc, idx) => <FunctionDisplay key={idx} toolCall={tc} />)}
      </div>
    </div>
  );
}