import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "quote",    label: "Quote",            description: "Reuse the contents for a new quote" },
  { value: "invoice",  label: "Invoice",           description: "Charge this quote to a customer" },
];

export default function CopyQuoteToModal({ open, onClose, onSelect }) {
  const [selected, setSelected] = useState(null);

  const handleConfirm = () => {
    if (!selected) return;
    onSelect(selected);
    setSelected(null);
  };

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Copy quote to</DialogTitle>
        </DialogHeader>
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border mt-2">
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors ${selected === opt.value ? "bg-primary/5" : ""}`}
              onClick={() => setSelected(opt.value)}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${selected === opt.value ? "border-primary" : "border-muted-foreground/40"}`}>
                {selected === opt.value && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
              </div>
              <span className="text-sm">
                <span className="font-semibold text-foreground">{opt.label}</span>
                {" "}
                <span className="text-muted-foreground">{opt.description}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button disabled={!selected} onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700 text-white">
            Create draft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}