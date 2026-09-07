// Block-aware, measurement-based pagination for quote/invoice documents.
// Treats the header, each line-item row, the totals block, the notes block and
// the terms block as ATOMIC units. It packs as many units as fit on page 1
// (without overlapping the absolutely-positioned footer) and spills the rest
// onto page 2. A unit is never cut mid-content.
//
// `measureEl` must contain a full-measurement render of DocContent (all items,
// totals, notes and terms visible) living in the rendered DOM (off-screen is
// fine; display:none is not, because getBoundingClientRect would return zeros).

const PADDING_TOP = 24;
const PADDING_BOTTOM = 64; // reserves space for the absolutely-positioned footer

export function computeDocPages(measureEl, pageHeight = 1123) {
  if (!measureEl) return [{ itemStart: 0, itemEnd: 9999, showTotals: true, showNotes: true, showTerms: true, isContinuation: false }];
  const usable = pageHeight - PADDING_TOP - PADDING_BOTTOM;
  const docRoot = (measureEl.querySelector && measureEl.querySelector("[data-doc-root]")) || measureEl;
  const rootRect = docRoot.getBoundingClientRect();
  const contentTop = rootRect.top + PADDING_TOP;

  const pos = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const top = r.top - contentTop;
    return { top, bottom: top + r.height, height: r.height };
  };

  const header = pos(measureEl.querySelector("[data-block='header']"));
  const itemsTable = measureEl.querySelector("[data-block='items']");
  const rowEls = itemsTable ? Array.from(itemsTable.querySelectorAll("tbody [data-item-row]")) : [];
  const rows = rowEls.map(pos).filter(Boolean);
  const totals = pos(measureEl.querySelector("[data-block='totals']"));
  const notes = pos(measureEl.querySelector("[data-block='notes']"));
  const terms = pos(measureEl.querySelector("[data-block='terms']"));

  const hasTotals = !!totals;
  const hasNotes = !!notes;
  const hasTerms = !!terms;
  const itemCount = rows.length;

  const lastRowBottom = itemCount ? rows[itemCount - 1].bottom : (header ? header.bottom : 0);
  const allItemsFit = lastRowBottom <= usable;

  if (allItemsFit) {
    // Each block is evaluated independently. Blocks are in vertical order
    // (totals → notes → terms), so if an earlier block overflows, later ones
    // will too — but a MISSING block (e.g. no notes) must not force later
    // blocks onto page 2. That was the bug: showTerms was chained through
    // showNotes, so a quote with no notes always pushed terms to page 2.
    const showTotals = hasTotals && totals.bottom <= usable;
    const showNotes = hasNotes && notes.bottom <= usable;
    const showTerms = hasTerms && terms.bottom <= usable;
    const page1 = { itemStart: 0, itemEnd: itemCount, showTotals, showNotes, showTerms, isContinuation: false };
    const p2Totals = hasTotals && !showTotals;
    const p2Notes = hasNotes && !showNotes;
    const p2Terms = hasTerms && !showTerms;
    if (p2Totals || p2Notes || p2Terms) {
      return [page1, { itemStart: 0, itemEnd: 0, showTotals: p2Totals, showNotes: p2Notes, showTerms: p2Terms, isContinuation: true }];
    }
    return [page1];
  }

  // Items overflow page 1 — split items; trailing blocks go to page 2.
  let page1End = 0;
  for (const r of rows) {
    if (r.bottom <= usable) page1End++;
    else break;
  }
  if (page1End === 0) page1End = Math.min(1, itemCount);
  return [
    { itemStart: 0, itemEnd: page1End, showTotals: false, showNotes: false, showTerms: false, isContinuation: false },
    { itemStart: page1End, itemEnd: itemCount, showTotals: true, showNotes: true, showTerms: true, isContinuation: true },
  ];
}

export function samePlan(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.itemStart !== y.itemStart || x.itemEnd !== y.itemEnd ||
        !!x.showTotals !== !!y.showTotals || !!x.showNotes !== !!y.showNotes ||
        !!x.showTerms !== !!y.showTerms || !!x.isContinuation !== !!y.isContinuation) return false;
  }
  return true;
}