import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import BillFormBody from "@/components/purchasing/BillFormBody";
import { printBillPdfFromHtml } from "@/components/purchasing/billPdfFromHtml";
import { syncContactType } from "@/lib/syncContactType";
import { autoPostJournal } from "@/lib/autoPostJournal";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { useToast } from "@/components/ui/use-toast";
import { Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { assignOfficialNumber, isApprovedStatus } from "@/lib/assignNumber";
import { prepareBillSave, verifyBillSave } from "@/lib/billFormValues";

export default function BillEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id;
  const { can } = usePermissionsMatrix();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canEdit = can("bills", isNew ? "can_create" : "can_edit");

  const initial = location.state?.duplicate || location.state?.initial || null;
  const [bill, setBill] = useState(isNew ? initial : undefined);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    base44.entities.Contact.list("full_name", 5000).then(setContacts).catch(err => console.error(err));
    base44.entities.DocumentTemplate.list("-created_date", 50).then(setTemplates).catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (isNew) return;
    let active = true;
    base44.entities.Bill.get(id).then(b => { if (active) setBill(b); }).catch(() => { if (active) setBill(null); });
    return () => { active = false; };
  }, [id, isNew]);

  // Re-read duplicate/initial payload when navigating to /new with state
  useEffect(() => {
    if (isNew) {
      const initial = location.state?.duplicate || location.state?.initial || null;
      if (initial) setBill(initial);
    }
  }, [isNew, location.state]);

  const handleSave = async (form, { close = false, pendingFiles } = {}) => {
    const cleanForm = prepareBillSave(form);
    const prevStatus = bill?.status;
    syncContactType(cleanForm.contact_id, "provider").catch(err => console.error(err));
    const saved = bill?.id
      ? await base44.entities.Bill.update(bill.id, cleanForm)
      : await base44.entities.Bill.create(cleanForm);
    const savedId = bill?.id ?? saved.id;
    if (pendingFiles?.length) {
      await Promise.all(pendingFiles.map(f => base44.entities.DocumentFile.create({
        doc_type: "bill", doc_id: savedId, doc_number: cleanForm.number || "",
        file_name: f.file_name, file_url: f.file_url, file_size: f.file_size, file_type: f.file_type,
      })));
    }
    // Official internal number: assigned on the server once the bill is approved.
    if (!cleanForm.number && (isApprovedStatus("Bill", cleanForm.status) || ["Awaiting Payment", "Paid"].includes(cleanForm.status))) {
      await assignOfficialNumber("Bill", savedId);
    }
    // Read the persisted record, not the update response or the previous bill.
    const fresh = await base44.entities.Bill.get(savedId);
    verifyBillSave(fresh, cleanForm);
    queryClient.setQueryData(["bills", "detail", savedId], fresh);
    await queryClient.invalidateQueries({ queryKey: ["bills"] });
    setBill(fresh);
    if (cleanForm.status === "Awaiting Payment" && prevStatus !== "Awaiting Payment") {
      autoPostJournal("Bill", fresh).catch(err => console.error(err));
    }
    if (close) navigate("/purchasing/bills");
    else if (!bill?.id) navigate(`/purchasing/bills/${savedId}/edit`, { replace: true });
    return fresh;
  };

  const handlePrint = async (b) => {
    const real = templates.filter(t => !String(t.name || "").startsWith("__"));
    const template = real.find(t => t.is_default && (t.document_types || []).includes("bill"))
      || real.find(t => (t.document_types || []).includes("bill"))
      || real.find(t => t.is_default)
      || real[0] || {};
    let fresh = b;
    if (b?.id) { try { fresh = await base44.entities.Bill.get(b.id); } catch { fresh = b; } }
    const contact = contacts.find(c => c.id === fresh.contact_id);
    const t = toast({ title: "Generating PDF", description: "Preparing your bill document…" });
    try {
      await printBillPdfFromHtml({ bill: fresh, contact, template });
      t.update({ title: "PDF ready", description: "Your bill has been downloaded" });
    } catch (e) {
      t.update({ title: "PDF failed", description: "Could not generate the PDF", variant: "destructive" });
    }
  };

  if (bill === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
        Loading bill...
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <Lock className="w-10 h-10 text-muted-foreground/40" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">Access restricted</h2>
          <p className="text-xs text-muted-foreground mt-1">
            You don't have permission to {isNew ? "create" : "edit"} bills.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/purchasing/bills")}>
          Back to Bills
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Breadcrumb */}
      <div className="px-2 pt-4 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/purchasing-overview" className="hover:text-primary transition-colors">Purchasing overview</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/purchasing/bills" className="hover:text-primary transition-colors">Bills</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">{bill?.id ? "Edit" : "New"}</span>
        </div>
      </div>

      {/* White card with the form */}
      <div className="flex-1 overflow-y-auto px-2 pb-10">
        <div className="w-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <BillFormBody
            bill={bill}
            contacts={contacts}
            onSave={handleSave}
            onClose={() => navigate("/purchasing/bills")}
            onPrint={handlePrint}
            isPage
            active
          />
        </div>
      </div>
    </div>
  );
}