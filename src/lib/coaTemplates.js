import { DEFAULT_COA } from "@/lib/defaultCOA";
import { SPAIN_COA } from "@/lib/coa_spain";

/**
 * Available COA templates by country/region.
 * To add a new country, create a `coa_<country>.js` file exporting an array
 * and register it here. Each entry: { code, name, type, category, is_system, enable_payments? }
 */
export const COA_TEMPLATES = [
  {
    key: "international",
    label: "International",
    desc: "Standard international chart of accounts (VAT, IFRS-aligned).",
    flag: "🌍",
    coa: DEFAULT_COA,
  },
  {
    key: "spain",
    label: "Spain (Plan General Contable)",
    desc: "Spanish PGC main accounts (4-digit codes) with IVA accounts. Added alongside the existing chart; nothing is overwritten.",
    flag: "🇪🇸",
    coa: SPAIN_COA,
  },
];

export const downloadTemplateCsv = (tpl) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Code", "Name", "Type", "Category"], ...tpl.coa.map(a => [a.code, a.name, a.type, a.category])];
  const blob = new Blob(["\uFEFF" + rows.map(r => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url; el.download = `coa_${tpl.key}.csv`; el.click();
  URL.revokeObjectURL(url);
};