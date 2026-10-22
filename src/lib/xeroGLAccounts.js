import { base44 } from "@/api/base44Client";
import { exactImportText } from "@/lib/importMatching";

// Targeted lookups also find codeless accounts outside the dropdown's initial page.
export default async function loadGLAccountMatches(journals) {
  const candidates = new Map();
  for (const journal of journals) {
    for (const row of journal.lines) {
      const code = String(row.AccountCode || row.accountcode || "").trim();
      const name = String(row.AccountName || row.Account || row.accountname || row.account || "").trim();
      if (code) candidates.set(`code:${code.toLowerCase()}`, { code: exactImportText(code) });
      if (name) candidates.set(`name:${name.toLowerCase()}`, { name: exactImportText(name) });
    }
  }
  const queries = [...candidates.values()];
  const matches = new Map();
  for (let i = 0; i < queries.length; i += 50) {
    const { items } = await base44.entities.ChartOfAccount.filter({ $or: queries.slice(i, i + 50) }, { limit: 1000 });
    items.forEach(account => matches.set(account.id, account));
  }
  return [...matches.values()];
}