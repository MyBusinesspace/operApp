import { base44 } from "@/api/base44Client";

// Loads incoterms settings (stored as JSON in a DocumentTemplate record named __incoterms__).
// Mirrors the tax-rates storage pattern. Returns { list, defaultQuote, defaultInvoice }.

export const DEFAULT_INCOTERMS = [
  { code: "EXW", description: "Ex Works", explanation: "The seller makes the goods available at their premises. The buyer bears all costs and risks of transport from that point.", is_default_quote: true, is_default_invoice: true },
  { code: "FCA", description: "Free Carrier", explanation: "The seller delivers goods, cleared for export, to the carrier nominated by the buyer at the named place.", is_default_quote: false, is_default_invoice: false },
  { code: "CPT", description: "Carriage Paid To", explanation: "The seller pays for carriage to the named destination. Risk transfers to the buyer when goods are handed to the carrier.", is_default_quote: false, is_default_invoice: false },
  { code: "CIP", description: "Carriage and Insurance Paid To", explanation: "The seller pays for carriage and insurance to the named destination. Risk transfers when goods are handed to the carrier.", is_default_quote: false, is_default_invoice: false },
  { code: "DAP", description: "Delivered at Place", explanation: "The seller delivers goods to the named place, ready for unloading. The buyer bears import clearance, duties and risks.", is_default_quote: false, is_default_invoice: false },
  { code: "DPU", description: "Delivered at Place Unloaded", explanation: "The seller delivers and unloads goods at the named place. The buyer bears import clearance and duties.", is_default_quote: false, is_default_invoice: false },
  { code: "DDP", description: "Delivered Duty Paid", explanation: "The seller delivers goods cleared for import at the named place. The seller bears all costs and risks including duties and taxes.", is_default_quote: false, is_default_invoice: false },
  { code: "FAS", description: "Free Alongside Ship", explanation: "The seller places goods alongside the vessel at the named port of shipment. The buyer bears all subsequent costs and risks.", is_default_quote: false, is_default_invoice: false },
  { code: "FOB", description: "Free on Board", explanation: "The seller delivers goods on board the vessel at the named port of shipment. Risk transfers once goods are on board.", is_default_quote: false, is_default_invoice: false },
  { code: "CFR", description: "Cost and Freight", explanation: "The seller pays for carriage to the port of destination. Risk transfers when goods are loaded on the vessel at the port of shipment.", is_default_quote: false, is_default_invoice: false },
  { code: "CIF", description: "Cost, Insurance and Freight", explanation: "The seller pays for carriage and insurance to the port of destination. Risk transfers when goods are loaded on the vessel.", is_default_quote: false, is_default_invoice: false },
  { code: "S&I", description: "Supply and Installed", explanation: "The seller makes the goods available at their premises. The buyer bears all costs and risks of download from truck at site location.", is_default_quote: false, is_default_invoice: false },
];

export async function loadIncoterms() {
  const list = await base44.entities.DocumentTemplate.list("name", 100).catch(() => []);
  const rec = list.find(t => t.name === "__incoterms__");
  if (rec) {
    try {
      const parsed = JSON.parse(rec.footer_notes || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge any default incoterms missing from the stored list (e.g. newly added defaults)
        const storedCodes = new Set(parsed.map(i => i.code));
        const missing = DEFAULT_INCOTERMS.filter(d => !storedCodes.has(d.code));
        return [...parsed, ...missing];
      }
    } catch {}
  }
  return DEFAULT_INCOTERMS;
}

export function defaultIncoterm(incoterms, type) {
  // type = "quote" | "invoice"
  const key = type === "invoice" ? "is_default_invoice" : "is_default_quote";
  return incoterms.find(i => i[key])?.code || incoterms[0]?.code || "";
}

// Returns the label for a given incoterm code: "Description — explanation".
export function getIncotermExplanation(incoterms, code) {
  if (!code) return "";
  const found = incoterms.find(i => i.code === code);
  if (!found) return "";
  return [found.description, found.explanation].filter(Boolean).join(" — ");
}