import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Send, ExternalLink } from "lucide-react";

/**
 * SendQuoteModal
 * Shows a shareable "view" link for the quote (opens the print preview).
 * Also lets user mark it as Sent immediately.
 */
export default function SendQuoteModal({ open, onClose, quote, onMarkAsSent }) {
  const [copied, setCopied] = useState(false);

  // Build a deep link — uses current origin + a route that can preview the quote.
  // We encode the quote id in a URL param so it can be shared.
  const shareUrl = quote
    ? `${window.location.origin}/sales/quotes?preview=${quote.id}`
    : "";

  const markSentIfNeeded = () => {
    const alreadySent = ["Sent", "Accepted", "Invoiced", "Declined", "Cancelled"].includes(quote?.status);
    if (!alreadySent) onMarkAsSent?.();
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      markSentIfNeeded();
    });
  };

  const handleOpen = () => {
    window.open(shareUrl, "_blank");
    markSentIfNeeded();
  };

  const handleMarkSent = () => {
    onMarkAsSent?.();
    onClose();
  };

  const alreadySent = ["Sent", "Accepted", "Invoiced", "Declined", "Cancelled"].includes(quote?.status);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            Send Quote {quote?.number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Shareable link */}
          <div>
            <p className="text-sm font-medium text-foreground mb-1.5">Shareable link</p>
            <p className="text-xs text-muted-foreground mb-3">
              Copy this link and send it to your customer. Copying or opening the link will automatically mark the quote as <strong>Sent</strong>.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="text-xs font-mono bg-muted/40"
                onClick={e => e.target.select()}
              />
              <Button type="button" size="icon" variant="outline" onClick={handleCopy} className="flex-shrink-0" title="Copy link">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button type="button" size="icon" variant="outline" onClick={handleOpen} className="flex-shrink-0" title="Open link">
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Mark as Sent */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Mark as Sent</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Update the quote status to <strong>Sent</strong> without sharing a link.
              </p>
            </div>
            <Button
              type="button"
              className="w-full gap-2"
              onClick={handleMarkSent}
              disabled={alreadySent}
            >
              <Send className="w-4 h-4" />
              {alreadySent ? "Already marked as Sent" : "Mark as Sent"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}