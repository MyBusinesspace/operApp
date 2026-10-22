import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import BillFormBody from "@/components/purchasing/BillFormBody";

export default function BillFormModal({ open, onClose, onSave, bill, contacts = [], onPrint }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[90vw] max-w-[90vw] max-h-[92vh] overflow-y-auto" hideClose>
        <BillFormBody
          bill={bill}
          contacts={contacts}
          onSave={onSave}
          onClose={onClose}
          onPrint={onPrint}
          isPage={false}
          active={open}
        />
      </DialogContent>
    </Dialog>
  );
}