// Idempotent pass that links existing GL-imported JournalEntry records to
// Invoice / Bill / CreditNote documents by updating LINK FIELDS ONLY:
//   source_type, source_id, source_number, contact_id, contact_name
// It never touches date, number, lines, amounts, status, narration, reference,
// or entry_type.
//
// Matching scope: posted journals whose reference starts with "XERO-".
// Skips the opening journal (source_type "OpeningBalance") and any journal
// that already has a source_id (already linked).
//
// Candidate rules:
//  (1) Document postings (Invoice / Bill / CreditNote): the journal must
//      have an AR/AP line on the CORRECT SIDE — invoice: AR debit; bill:
//      AP credit; credit note: AR credit (reverse of invoice) — with amount
//      == doc total (abs, ±0.01), same date as doc issue_date, and narration
//      containing the doc reference or contact name. Journals whose narration
//      starts with "Payment:" or "Reversed:" are excluded (they are not
//      document postings).
//  (2) Payment journals (narration starts "Payment:" / "Overpayment:" /
//      "Reversed: Payment"): same date as a payments[] entry on a doc,
//      AR/AP line amount == payment amount, narration contains the doc
//      contact name. source_type is set to the document type and
//      source_number to the document number.
//
// Phase 1: stamps link_confidence='exact' when exactly one candidate matches.
// Phase 2: within each group of N identical candidate docs and N journals
// (same contact+date+total), pairs them by ascending number and stamps
// link_confidence='ordered'. If group sizes differ, leaves them as ambiguous.
//
// Phase 3 (rule 3): reposts/reversals with no date match link by contact+amount
// when exactly one candidate document exists (link_confidence='exact'; enum allows only exact|ordered).
//
// Returns { linked, alreadyLinked, exact, ordered, ambiguous, unmatched, ambiguousDetails }.

import { base44 } from "@/api/base44Client";
import { withRetry, delay, readAllPages } from "@/lib/sdkRetry";

const AR_CODES = new Set(["610", "1700"]);
const AP_CODES = new Set(["800", "0800"]);

const amtEq = (a, b) => Math.abs(Math.abs(a) - Math.abs(b)) <= 0.01;

const lineAmount = (line) =>
  Math.abs(Number(line?.debit || 0)) + Math.abs(Number(line?.credit || 0));

const isPaymentNarration = (narration) => {
  const n = String(narration || "").trim().toLowerCase();
  return (
    n.startsWith("payment:") ||
    n.startsWith("overpayment:") ||
    n.startsWith("reversed: payment")
  );
};

const containsCI = (haystack, needle) => {
  if (!needle) return false;
  return String(haystack || "")
    .toLowerCase()
    .includes(String(needle).toLowerCase());
};

const findArLine = (lines) =>
  (lines || []).find((l) => AR_CODES.has(String(l.account_code || "").trim()));

const findApLine = (lines) =>
  (lines || []).find((l) => AP_CODES.has(String(l.account_code || "").trim()));

// Side-aware finders for document postings: invoice debits AR, bill credits
// AP, credit note credits AR (reverse of invoice).
const findArDebitLine = (lines) =>
  (lines || []).find((l) => AR_CODES.has(String(l.account_code || "").trim()) && Number(l.debit || 0) > 0);

const findArCreditLine = (lines) =>
  (lines || []).find((l) => AR_CODES.has(String(l.account_code || "").trim()) && Number(l.credit || 0) > 0);

const findApCreditLine = (lines) =>
  (lines || []).find((l) => AP_CODES.has(String(l.account_code || "").trim()) && Number(l.credit || 0) > 0);

// Journals with these narration prefixes are not document postings — they are
// payments, reversals, or re-posts that would inflate the candidate count.
const isNonPostingNarration = (narration) => {
  const n = String(narration || "").trim().toLowerCase();
  return n.startsWith("payment:") || n.startsWith("overpayment:") || n.startsWith("reversed:");
};

// ── Load all docs and build lookup indexes ──────────────────────────────────
async function loadDocIndexes() {
  const [invoices, bills, creditNotes] = await Promise.all([
    readAllPages("Invoice", {}, {
      limit: 1000,
      fields: ["id", "number", "reference", "contact_id", "contact_name", "issue_date", "total", "payments"],
    }),
    readAllPages("Bill", {}, {
      limit: 1000,
      fields: ["id", "number", "reference", "contact_id", "contact_name", "issue_date", "total", "payments"],
    }),
    readAllPages("CreditNote", {}, {
      limit: 1000,
      fields: ["id", "number", "reference", "contact_id", "contact_name", "issue_date", "total"],
    }),
  ]);

  const invByDate = new Map();
  const billByDate = new Map();
  const cnByDate = new Map();
  const paymentsByDate = new Map(); // date -> [{ doc, docType, payment }]

  const addToDateMap = (map, date, doc) => {
    if (!date) return;
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(doc);
  };
  const addPayment = (date, entry) => {
    if (!date) return;
    if (!paymentsByDate.has(date)) paymentsByDate.set(date, []);
    paymentsByDate.get(date).push(entry);
  };

  for (const inv of invoices) {
    addToDateMap(invByDate, inv.issue_date, inv);
    for (const p of inv.payments || []) {
      addPayment(p.date, { doc: inv, docType: "Invoice", payment: p });
    }
  }
  for (const b of bills) {
    addToDateMap(billByDate, b.issue_date, b);
    for (const p of b.payments || []) {
      addPayment(p.date, { doc: b, docType: "Bill", payment: p });
    }
  }
  for (const cn of creditNotes) {
    addToDateMap(cnByDate, cn.issue_date, cn);
  }

  const allDocs = [
    ...invoices.map((d) => ({ doc: d, source_type: "Invoice" })),
    ...bills.map((d) => ({ doc: d, source_type: "Bill" })),
    ...creditNotes.map((d) => ({ doc: d, source_type: "CreditNote" })),
  ];

  return { invByDate, billByDate, cnByDate, paymentsByDate, allDocs };
}

// Rule (3): reposts / reversals. Match by CONTACT + AMOUNT only (date ignored).
// A journal links only when exactly one document has that contact in the
// narration and a total equal to an AR/AP line amount. Link fields only.
function findContactAmountCandidates(je, indexes) {
  const narration = je.narration || "";
  if (isPaymentNarration(narration)) return [];
  const arLine = findArLine(je.lines);
  const apLine = findApLine(je.lines);
  const arAmt = arLine ? lineAmount(arLine) : 0;
  const apAmt = apLine ? lineAmount(apLine) : 0;
  const out = [];
  const seen = new Set();
  for (const c of indexes.allDocs) {
    const total = Number(c.doc.total) || 0;
    if (!total || !c.doc.contact_name) continue;
    if (!containsCI(narration, c.doc.contact_name)) continue;
    const amt = c.source_type === "Bill" ? apAmt : arAmt;
    if (!amt || !amtEq(amt, total)) continue;
    if (seen.has(c.doc.id)) continue;
    seen.add(c.doc.id);
    out.push(c);
  }
  return out;
}

// ── Find candidate docs for a single journal ─────────────────────────────────
function findCandidates(je, indexes) {
  const { invByDate, billByDate, cnByDate, paymentsByDate } = indexes;
  const candidates = [];
  const narration = je.narration || "";
  const isPayment = isPaymentNarration(narration);
  const arLine = findArLine(je.lines);
  const apLine = findApLine(je.lines);

  if (isPayment) {
    const arAmt = arLine ? lineAmount(arLine) : 0;
    const apAmt = apLine ? lineAmount(apLine) : 0;
    const payments = paymentsByDate.get(je.date) || [];
    for (const { doc, docType, payment } of payments) {
      const pAmt = Math.abs(Number(payment.amount) || 0);
      if (docType === "Invoice" && arAmt > 0) {
        if (!amtEq(arAmt, pAmt)) continue;
      } else if (docType === "Bill" && apAmt > 0) {
        if (!amtEq(apAmt, pAmt)) continue;
      } else {
        continue;
      }
      if (!containsCI(narration, doc.contact_name)) continue;
      candidates.push({ doc, source_type: docType, amount: pAmt });
    }
  } else if (isNonPostingNarration(narration)) {
    // Reversals and other non-posting narrations are not document posting
    // candidates — they would inflate the candidate count.
    return [];
  } else {
    // Document postings: side-aware AR/AP matching.
    //   Invoice → AR debit line, amount == invoice total
    //   Bill    → AP credit line, amount == bill total
    //   CreditNote → AR credit line, amount == credit note total
    const arDebitLine = findArDebitLine(je.lines);
    const arCreditLine = findArCreditLine(je.lines);
    const apCreditLine = findApCreditLine(je.lines);

    if (arDebitLine) {
      const arAmt = lineAmount(arDebitLine);
      for (const inv of invByDate.get(je.date) || []) {
        if (!amtEq(arAmt, Number(inv.total) || 0)) continue;
        if (!containsCI(narration, inv.reference) && !containsCI(narration, inv.contact_name)) continue;
        candidates.push({ doc: inv, source_type: "Invoice", amount: arAmt });
      }
    }
    if (arCreditLine) {
      const arAmt = lineAmount(arCreditLine);
      for (const cn of cnByDate.get(je.date) || []) {
        if (!amtEq(arAmt, Number(cn.total) || 0)) continue;
        if (!containsCI(narration, cn.reference) && !containsCI(narration, cn.contact_name)) continue;
        candidates.push({ doc: cn, source_type: "CreditNote", amount: arAmt });
      }
    }
    if (apCreditLine) {
      const apAmt = lineAmount(apCreditLine);
      for (const b of billByDate.get(je.date) || []) {
        if (!amtEq(apAmt, Number(b.total) || 0)) continue;
        if (!containsCI(narration, b.reference) && !containsCI(narration, b.contact_name)) continue;
        candidates.push({ doc: b, source_type: "Bill", amount: apAmt });
      }
    }
  }

  // Deduplicate by doc id (a journal with both AR and AP could double-match)
  const seen = new Set();
  return candidates.filter((c) => {
    if (seen.has(c.doc.id)) return false;
    seen.add(c.doc.id);
    return true;
  });
}

// ── Main entry ───────────────────────────────────────────────────────────────
export async function linkJournalsToDocs({ from, to, onProgress } = {}) {
  const result = { linked: 0, alreadyLinked: 0, exact: 0, ordered: 0, ambiguous: 0, unmatched: 0, singleCandidate: 0, ambiguousDetails: [] };

  const indexes = await loadDocIndexes();

  const jeQuery = { status: "Posted", reference: { $regex: "^XERO-" } };
  if (from || to) {
    jeQuery.date = {};
    if (from) jeQuery.date.$gte = from;
    if (to) jeQuery.date.$lte = to;
  }

  // Total count for progress (best-effort)
  let total = null;
  try {
    total = await withRetry(() => base44.entities.JournalEntry.count(jeQuery), {
      label: "JournalEntry.count",
    });
  } catch {}

  // Phase 1: Process all pages. Single-match links are applied per page with
  // link_confidence='exact'. Ambiguous journals are collected into groups keyed
  // by their sorted candidate-doc IDs for deterministic tie-breaking in Phase 2.
  const leftovers = []; // no date-based candidate: reposts / reversals for rule (3)
  const ambiguousGroups = new Map(); // sortedDocIds -> { journals: [...], docs: [...] }
  const numericSort = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true });

  let skip = 0;
  let processed = 0;

  for (;;) {
    const page = await withRetry(
      () => base44.entities.JournalEntry.filter(
        jeQuery,
        "number", // unique sort key => stable skip pagination (date has many ties)
        500,
        skip,
        ["id", "number", "date", "narration", "reference", "source_type", "source_id", "lines"]
      ),
      { label: "JournalEntry.filter" }
    );
    const items = page.items || (Array.isArray(page) ? page : []);
    if (!items.length) break;

    const pendingUpdates = [];
    for (const je of items) {
      // Skip opening journal and already-linked journals
      if (je.source_type === "OpeningBalance" || je.source_id) {
        result.alreadyLinked++;
        processed++;
        if (onProgress && total) onProgress(Math.round((processed / total) * 100));
        continue;
      }

      const candidates = findCandidates(je, indexes);

      if (candidates.length === 1) {
        const c = candidates[0];
        pendingUpdates.push({
          id: je.id,
          source_type: c.source_type,
          source_id: c.doc.id,
          source_number: c.doc.number,
          contact_id: c.doc.contact_id || null,
          contact_name: c.doc.contact_name || null,
          link_confidence: "exact",
        });
      } else if (candidates.length > 1) {
        // Group by sorted candidate doc IDs for deterministic tie-breaking
        const arLine = findArLine(je.lines);
        const apLine = findApLine(je.lines);
        const amt = arLine ? lineAmount(arLine) : apLine ? lineAmount(apLine) : 0;
        const docIds = candidates.map((c) => c.doc.id).sort().join("|");
        if (!ambiguousGroups.has(docIds)) {
          ambiguousGroups.set(docIds, {
            journals: [],
            docs: candidates.map((c) => ({ doc: c.doc, source_type: c.source_type })),
          });
        }
        ambiguousGroups.get(docIds).journals.push({
          id: je.id,
          number: je.number,
          date: je.date,
          narration: je.narration,
          amount: amt,
        });
      } else {
        leftovers.push(je);
      }
      processed++;
      if (onProgress && total) onProgress(Math.round((processed / total) * 100));
    }

    // Apply link-field updates for this page in one bulk call
    if (pendingUpdates.length > 0) {
      try {
        await withRetry(
          () => base44.entities.JournalEntry.bulkUpdate(pendingUpdates),
          { label: "JournalEntry.bulkUpdate" }
        );
        result.linked += pendingUpdates.length;
        result.exact += pendingUpdates.length;
      } catch {
        result.unmatched += pendingUpdates.length;
      }
    }

    skip += items.length;
    if (items.length < 500) break;
    await delay(120);
  }

  // Phase 2: Deterministic tie-breaker for ambiguous groups.
  // When N journals share the same N candidate docs (same contact+date+total),
  // sort journals by number ascending and docs by number ascending, then pair
  // them in order. Stamps link_confidence='ordered' so they can be listed for review.
  // If group sizes differ (N journals != M docs), leave all as ambiguous.
  const orderedUpdates = [];

  for (const group of ambiguousGroups.values()) {
    const { journals, docs } = group;
    if (journals.length === docs.length && docs.length > 1) {
      const sortedJournals = [...journals].sort((a, b) => numericSort(a.number, b.number));
      const sortedDocs = [...docs].sort((a, b) => numericSort(a.doc.number, b.doc.number));
      for (let i = 0; i < sortedJournals.length; i++) {
        const je = sortedJournals[i];
        const { doc, source_type } = sortedDocs[i];
        orderedUpdates.push({
          id: je.id,
          source_type,
          source_id: doc.id,
          source_number: doc.number,
          contact_id: doc.contact_id || null,
          contact_name: doc.contact_name || null,
          link_confidence: "ordered",
        });
      }
    } else {
      // Group sizes differ — cannot deterministically pair, leave as ambiguous
      result.ambiguous += journals.length;
      for (const je of journals) {
        result.ambiguousDetails.push({
          journal_id: je.id,
          number: je.number,
          date: je.date,
          amount: je.amount,
          candidate_numbers: docs.map((d) => d.doc.number),
          group_journals: journals.length,
          group_docs: docs.length,
        });
      }
    }
  }

  // Apply ordered tie-breaker updates in batches of 500
  for (let i = 0; i < orderedUpdates.length; i += 500) {
    const batch = orderedUpdates.slice(i, i + 500);
    try {
      await withRetry(
        () => base44.entities.JournalEntry.bulkUpdate(batch),
        { label: "JournalEntry.bulkUpdate" }
      );
      result.ordered += batch.length;
      result.linked += batch.length;
    } catch {
      result.unmatched += batch.length;
    }
  }

  // Phase 3: reposts / reversals (and any other journal with no date-based
  // match). Contact + amount, exactly one candidate document -> link.
  // Ambiguous or zero candidates stay unlinked (counted as unmatched).
  const singleUpdates = [];
  result.leftovers = leftovers.length;
  result.docsIndexed = (indexes.allDocs || []).length;
  for (const je of leftovers) {
    let cands = [];
    try { cands = findContactAmountCandidates(je, indexes); } catch (e) { result.firstError = e?.message; }
    if (cands.length === 1) {
      const c = cands[0];
      singleUpdates.push({
        id: je.id,
        source_type: c.source_type,
        source_id: c.doc.id,
        source_number: c.doc.number,
        contact_id: c.doc.contact_id || null,
        contact_name: c.doc.contact_name || null,
        link_confidence: "exact",
      });
    } else {
      result.unmatched++;
    }
  }
  for (let i = 0; i < singleUpdates.length; i += 500) {
    const batch = singleUpdates.slice(i, i + 500);
    try {
      await withRetry(
        () => base44.entities.JournalEntry.bulkUpdate(batch),
        { label: "JournalEntry.bulkUpdate" }
      );
      result.singleCandidate += batch.length;
      result.linked += batch.length;
    } catch (bulkErr) {
      result.firstError = bulkErr?.message || String(bulkErr);
      // Fallback: per-record update (link fields only)
      for (const u of batch) {
        const { id, ...fields } = u;
        try {
          await withRetry(
            () => base44.entities.JournalEntry.update(id, fields),
            { label: "JournalEntry.update" }
          );
          result.singleCandidate++;
          result.linked++;
        } catch (e) {
          result.firstError = result.firstError || e?.message;
          result.unmatched++;
        }
      }
    }
  }

  // Phase 4: reversal chains. Xero writes "... - Reversal of ID <n>" on every reversal
  // journal, where <n> is the Xero number of the journal being reversed (reference XERO-<n>).
  // A reversal and the journal it reverses belong to the same document, so link the
  // unlinked side to the linked side. Deterministic: no guessing, link fields only.
  try {
    const byNum = new Map(); // xero number -> record
    let sk = 0;
    for (;;) {
      const pg = await withRetry(
        () => base44.entities.JournalEntry.filter(
          { status: "Posted", reference: { $regex: "^XERO-" } },
          "number", 500, sk,
          ["id", "number", "narration", "reference", "source_type", "source_id", "source_number", "contact_id", "contact_name"]
        ),
        { label: "JournalEntry.filter(chain)" }
      );
      const its = pg.items || (Array.isArray(pg) ? pg : []);
      if (!its.length) break;
      for (const j of its) {
        const m = /^XERO-(\d+)$/.exec(j.reference || "");
        if (m) byNum.set(Number(m[1]), j);
      }
      sk += its.length;
      if (its.length < 500) break;
    }
    // Union-find over: reversal <-> journal it reverses, reversal <-> the repost that
    // follows it (next Xero number, same narration, not itself a reversal).
    const par = new Map();
    const find = (x) => { while (par.get(x) !== x) x = par.get(x); return x; };
    const add = (x) => { if (!par.has(x)) par.set(x, x); };
    const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
    for (const j of byNum.values()) {
      const nar = (j.narration || "").trim();
      const m = /^(Reversed: (?:Payment: )?)?(.*?) ?- Reversal of ID (\d+)$/.exec(nar);
      if (!m) continue;
      const o = byNum.get(Number(m[3]));
      if (o && o.source_type !== "OpeningBalance") union(Number(j.reference.slice(5)), Number(o.reference.slice(5)));
      const p = byNum.get(Number(j.reference.slice(5)) + 1);
      const pn = p && !/Reversal of ID/.test(p.narration || "") ? (p.narration || "").trim() : null;
      const want = (m[1] ? m[1].replace("Reversed: ", "") : "") + m[2].trim();
      if (p && pn && (pn === want || pn === m[2].trim())) union(Number(j.reference.slice(5)), Number(p.reference.slice(5)));
    }
    const comps = new Map();
    for (const n of par.keys()) { const r = find(n); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(byNum.get(n)); }
    let chainLinked = 0;
    const ups = [];
    for (const ms of comps.values()) {
      const linked = ms.filter((x) => x.source_id);
      const ids = new Set(linked.map((x) => x.source_id));
      if (ids.size !== 1) continue; // none linked or conflicting: leave alone
      const src = linked[0];
      for (const x of ms) {
        if (x.source_id) continue;
        ups.push({ rec: x, fields: {
          source_type: src.source_type, source_id: src.source_id, source_number: src.source_number,
          contact_id: src.contact_id || null, contact_name: src.contact_name || null,
          link_confidence: "ordered",
        } });
      }
    }
    for (let i = 0; i < ups.length; i += 500) {
      const batch = ups.slice(i, i + 500);
      try {
        await withRetry(
          () => base44.entities.JournalEntry.bulkUpdate(batch.map((u) => ({ id: u.rec.id, ...u.fields }))),
          { label: "JournalEntry.bulkUpdate(chain)" }
        );
      } catch (e) {
        for (const u of batch) {
          try { await base44.entities.JournalEntry.update(u.rec.id, u.fields); } catch { continue; }
        }
      }
      chainLinked += batch.length;
    }
    result.chainLinked = chainLinked;
    result.linked += chainLinked;
  } catch (e) {
    result.chainError = e?.message || String(e);
  }

  try { window.__linkResult = { ...result, ambiguousDetails: undefined }; } catch {}
  return result;
}
