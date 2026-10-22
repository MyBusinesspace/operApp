import React, { useState, useMemo } from "react";
import { X, Search, Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeAccountType, classifyAccountType } from "@/lib/accountTypes";
import { saveMappedImportRecord } from "@/lib/importMatching";

export default function UnmatchedAccountsModal({
  unmatchedAccounts, // [{ code, name, type, lineCount }]
  coaList, // [{ id, code, name, type, category }]
  mappings, // { code: coaId }
  onChangeMapping, // (code, coaId | null) => void
  onClose,
  onAccountsCreated, // () => refresh COA
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState(null);

  // Group COA by category for the dropdown
  const coaByCategory = useMemo(() => {
    const groups = {};
    coaList.forEach((a) => {
      const cat = a.category || "Other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(a);
    });
    Object.values(groups).forEach((arr) =>
      arr.sort((a, b) => (a.code || "").localeCompare(b.code || ""))
    );
    return groups;
  }, [coaList]);

  const filtered = useMemo(() => {
    if (!search.trim()) return unmatchedAccounts;
    const s = search.toLowerCase();
    return unmatchedAccounts.filter(
      (a) =>
        (a.code || "").toLowerCase().includes(s) ||
        (a.name || "").toLowerCase().includes(s)
    );
  }, [unmatchedAccounts, search]);

  const mappedCount = unmatchedAccounts.filter((a) => mappings[a.key || a.code]).length;
  const unmappedCount = unmatchedAccounts.length - mappedCount;

  const handleCreateAll = async () => {
    setCreating(true);
    setCreateStatus(null);
    const toCreate = unmatchedAccounts.filter((a) => !mappings[a.key || a.code]);
    const risky = toCreate.filter((a) => ["blank", "partial", "unknown"].includes(classifyAccountType(a.type).confidence));
    if (risky.length > 0) {
      const lines = risky.slice(0, 15).map((a) => {
        const c = classifyAccountType(a.type);
        return `${a.code} ${a.name || ""}: ${a.type || "(no type in file)"} -> ${c.type} / ${c.category || "no category"}`;
      }).join("\n");
      const ok = window.confirm(`${risky.length} account(s) will be created with a type that is a guess:\n\n${lines}\n\nCreate them anyway? Cancel to fix the type or map them manually.`);
      if (!ok) { setCreating(false); return; }
    }
    let created = 0;
    const failed = [];
    for (const acct of toCreate) {
      try {
        const { type, category } = normalizeAccountType(acct.type || "Expense");
        const code = acct.code !== "(no code)" ? acct.code : "";
        const saved = await saveMappedImportRecord("ChartOfAccount", {
          code, name: acct.name || acct.code, type, category, status: "Active", currency: "AED",
        }, code ? "code" : "name");
        onChangeMapping(acct.key || acct.code, saved.record.id);
        created++;
      } catch (err) {
        failed.push(`${acct.code}: ${err.message}`);
      }
    }
    setCreating(false);
    setCreateStatus({ created, failed, total: toCreate.length });
    if (created > 0) onAccountsCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-lg font-bold text-foreground">Map Unmatched Accounts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unmatchedAccounts.length} unique accounts from the GL file not found in your Chart of
              Accounts. Map them to existing accounts or create new ones.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary + actions */}
        <div className="flex items-center gap-3 px-5 py-3 bg-muted/30 border-b border-border">
          <span className="text-sm">
            <span className="font-semibold text-emerald-600">{mappedCount} mapped</span>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="font-semibold text-orange-600">{unmappedCount} unmapped</span>
          </span>
          <div className="flex-1" />
          {unmappedCount > 0 && (
            <Button
              onClick={handleCreateAll}
              disabled={creating}
              size="sm"
              variant="outline"
              className="gap-1.5"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {creating ? "Creating..." : `Create ${unmappedCount} New Accounts`}
            </Button>
          )}
        </div>

        {createStatus && (
          <div
            className={`mx-5 mt-3 p-2.5 rounded-lg text-xs ${
              createStatus.failed.length > 0
                ? "bg-amber-50 border border-amber-200 text-amber-800"
                : "bg-emerald-50 border border-emerald-200 text-emerald-800"
            }`}
          >
            Created {createStatus.created} of {createStatus.total} accounts.
            {createStatus.failed.length > 0 && ` ${createStatus.failed.length} failed.`}
          </div>
        )}

        {/* Search */}
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code or name..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                  GL Code
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                  GL Account Name
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                  GL Type
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                  Will be created as
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">
                  Lines
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                  Map to Account
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((acct) => {
                const mapKey = acct.key || acct.code;
                const mapped = mappings[mapKey];
                return (
                  <tr key={mapKey} className="hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs font-mono font-medium text-foreground">
                      {acct.code}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {acct.name || "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {acct.type || "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {(() => {
                        const c = classifyAccountType(acct.type);
                        const guess = ["blank", "partial", "unknown"].includes(c.confidence);
                        return (
                          <span className={guess ? "text-amber-700 font-medium" : "text-muted-foreground"}>
                            {c.type}{c.category ? ` / ${c.category}` : ""}{guess ? " (check)" : ""}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2 text-xs text-right tabular-nums text-muted-foreground">
                      {acct.lineCount || 0}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={mapped || ""}
                        onChange={(e) => onChangeMapping(mapKey, e.target.value || null)}
                        className={`h-8 rounded-md border px-2 text-xs w-full max-w-[280px] ${
                          mapped
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-border bg-card"
                        }`}
                      >
                        <option value="">— Not mapped —</option>
                        {Object.entries(coaByCategory).map(([cat, accounts]) => (
                          <optgroup key={cat} label={cat}>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.code ? `${a.code} — ${a.name}` : a.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No accounts match your search.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Mapped accounts will be linked in the imported journal entries.
          </p>
          <Button onClick={onClose} className="gap-1.5">
            <Check className="w-4 h-4" /> Done
          </Button>
        </div>
      </div>
    </div>
  );
}