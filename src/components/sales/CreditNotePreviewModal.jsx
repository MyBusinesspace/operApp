/**
 * Credit-note preview modal — the same shared DocContent, auto-fit and pagination
 * stack as InvoicePreviewModal, so what you see here is exactly what the credit
 * note PDF prints. Rendering a preview writes nothing and posts no journals.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Pencil, X } from "lucide-react";
import { computeDocPages, samePlan } from "@/lib/docPagination";
import { autoFitBodyFontSize, inlineImages } from "@/lib/docAutoFit";
import { renderToString } from "react-dom/server";
import { DocContent } from "@/components/sales/InvoicePreviewModal";
import { getSignedUrl } from "@/lib/privateFile";
import { creditNoteTitle } from "@/lib/creditNoteTemplate";

const A4_W = 794;
const A4_H = 1123;

const FULL_PAGE = { itemStart: 0, itemEnd: 9999, showTotals: true, showNotes: true, showTerms: true, isContinuation: false };

export default function CreditNotePreviewModal({ open, onClose, creditNote, contact, template, onPrint, onEdit }) {
  const measureRef = useRef(null);
  const [pages, setPages] = useState([FULL_PAGE]);
  const [autoFs, setAutoFs] = useState(null);
  const [resolvedAnnex, setResolvedAnnex] = useState(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Resolve private annex photo URIs to signed URLs so DocContent <img> loads on screen
  useEffect(() => {
    if (!open || !creditNote) return;
    let alive = true;
    const photos = (creditNote.annex_photos || []).filter(p => p.include !== false && p.url);
    if (photos.length === 0) { setResolvedAnnex(null); return; }
    Promise.all(photos.map(async p => ({ ...p, url: await getSignedUrl(p.url) })))
      .then(r => { if (alive) setResolvedAnnex(r); })
      .catch(() => { if (alive) setResolvedAnnex(null); });
    return () => { alive = false; };
  }, [open, creditNote]);

  const viewNote = resolvedAnnex ? { ...creditNote, annex_photos: resolvedAnnex } : creditNote;

  const t = template || {};
  const accentColor = t.accent_color || "#6366f1";
  const currency = creditNote?.currency || "AED";
  const title = creditNoteTitle(t, creditNote?.status);

  const docProps = (extra) => ({
    invoice: viewNote, contact, accentColor, currency, title, numberLabel: "Credit Note Number", ...extra,
  });

  // Auto-fit the body font size, measured off-screen with the same DocContent
  useLayoutEffect(() => {
    if (!open || !creditNote) return;
    if (t.auto_text_scale === false) { setAutoFs(null); return; }
    let cancelled = false;
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.zIndex = "-1";
    document.body.appendChild(container);
    const renderMeasure = async (fs) => {
      const html = renderToString(React.createElement(DocContent, docProps({ template: { ...t, body_font_size: fs }, page: FULL_PAGE, measure: true })));
      const wrapper = document.createElement("div");
      wrapper.style.width = A4_W + "px";
      wrapper.style.background = "#ffffff";
      wrapper.innerHTML = html;
      container.innerHTML = "";
      container.appendChild(wrapper);
      await inlineImages(wrapper);
      return wrapper;
    };
    (async () => {
      const fs = await autoFitBodyFontSize(renderMeasure);
      if (!cancelled) setAutoFs(fs);
    })();
    return () => { cancelled = true; document.body.removeChild(container); };
  }, [open, creditNote, template, accentColor, currency, title]);

  // Pagination — recompute whenever the auto-fit font size settles
  useLayoutEffect(() => {
    if (!open || !creditNote) return;
    const compute = () => {
      if (!measureRef.current) return;
      const plan = computeDocPages(measureRef.current);
      setPages(prev => (samePlan(prev, plan) ? prev : plan));
    };
    compute();
    const id = setTimeout(compute, 350);
    return () => clearTimeout(id);
  }, [open, creditNote, template, accentColor, currency, title, autoFs]);

  if (!open || !creditNote) return null;
  const fitT = { ...t, body_font_size: autoFs ?? (t.body_font_size || 8.5) };

  const SCALE = 0.9;
  const wrapperStyle = { width: A4_W * SCALE, height: A4_H * SCALE, position: "relative", overflow: "hidden" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden relative"
        style={{ width: "min(96vw, 1200px)", maxHeight: "96vh" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <span className="font-semibold text-sm">Credit Note Preview — {creditNote.number || "Draft"}</span>
          <div className="flex items-center gap-2">
            {onPrint && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onPrint}>
                <Printer className="w-3.5 h-3.5" /> Print PDF
              </Button>
            )}
            {onEdit && (
              <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 bg-slate-200 dark:bg-slate-800 p-6 flex flex-col items-center gap-6">
          {pages.map((page, idx) => (
            <div key={idx} className="relative shrink-0" style={wrapperStyle}>
              <div className="bg-white dark:bg-slate-800 shadow-xl rounded-sm overflow-hidden" style={{ width: A4_W, height: A4_H, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
                <DocContent {...docProps({ template: fitT, page })} />
              </div>
              <div className="absolute -top-5 left-0 text-[10px] text-slate-400 font-mono">Page {idx + 1} — A4</div>
            </div>
          ))}
        </div>

        {/* hidden measurement render — full document used to compute block-aware pagination */}
        <div aria-hidden style={{ position: "fixed", left: "-10000px", top: 0, width: A4_W, pointerEvents: "none", opacity: 0 }}>
          <div ref={measureRef} style={{ width: A4_W }}>
            <DocContent {...docProps({ template: fitT, page: FULL_PAGE, measure: true })} />
          </div>
        </div>
      </div>
    </div>
  );
}