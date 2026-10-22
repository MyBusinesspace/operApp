import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CreditNoteFormBody from "@/components/sales/CreditNoteFormBody";

export default function CreditNoteEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id;
  const duplicateSrc = isNew ? (location.state?.duplicate || null) : null;
  const [creditNote, setCreditNote] = useState(isNew ? duplicateSrc : undefined);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    base44.entities.Contact.list("full_name", 5000).then(setContacts).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    base44.entities.CreditNote.get(id).then(cn => { if (active) setCreditNote(cn); }).catch(() => { if (active) setCreditNote(null); });
    return () => { active = false; };
  }, [id, isNew]);

  if (creditNote === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading credit note...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-2 pt-4 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/sales-overview" className="hover:text-primary transition-colors">Sales overview</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/sales/credit-notes" className="hover:text-primary transition-colors">Credit notes</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{creditNote?.id ? "Edit" : "New"}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-10">
        <div className="w-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <CreditNoteFormBody
            creditNote={creditNote}
            contacts={contacts}
            isPage
            active
            onSave={(saved) => setCreditNote(saved)}
            onClose={() => navigate("/sales/credit-notes")}
          />
        </div>
      </div>
    </div>
  );
}