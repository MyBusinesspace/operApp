import { base44 } from "@/api/base44Client";

export async function generateProductCode() {
  try {
    const [list, products] = await Promise.all([
      base44.entities.DocumentTemplate.list("name", 100),
      base44.entities.Product.list("-created_date", 200),
    ]);
    const settings = list.find(t => t.name === "__product_settings__");
    let prefix = "ITM", padding = 4, includeYear = false, nextNumber = 1;
    if (settings) {
      const parsed = JSON.parse(settings.footer_notes || "{}");
      prefix = parsed.product_code_prefix || "ITM";
      padding = parsed.product_code_padding || 4;
      includeYear = !!parsed.product_code_include_year;
      nextNumber = parsed.product_code_next_number || 1;
    }
    const pattern = new RegExp(`^${prefix}-(?:\\d{4}-)?0*(\\d+)$`);
    let maxFound = 0;
    for (const p of products) {
      if (!p.code) continue;
      const m = p.code.match(pattern);
      if (m) { const n = parseInt(m[1], 10); if (n > maxFound) maxFound = n; }
    }
    const num = Math.max(nextNumber, maxFound + 1);
    const padded = String(num).padStart(padding, "0");
    const year = new Date().getFullYear();
    return includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
  } catch {
    return "";
  }
}

export async function incrementProductCodeCounter(generatedCode) {
  try {
    const list = await base44.entities.DocumentTemplate.list("name", 100);
    const settings = list.find(t => t.name === "__product_settings__");
    if (!settings) return;
    const parsed = JSON.parse(settings.footer_notes || "{}");
    const prefix = parsed.product_code_prefix || "ITM";
    const pattern = new RegExp(`^${prefix}-(?:\\d{4}-)?0*(\\d+)$`);
    const m = generatedCode.match(pattern);
    if (m) {
      parsed.product_code_next_number = parseInt(m[1], 10) + 1;
      await base44.entities.DocumentTemplate.update(settings.id, { footer_notes: JSON.stringify(parsed) });
    }
  } catch {}
}