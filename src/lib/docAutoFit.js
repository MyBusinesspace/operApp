// Auto-fit the body font size of quote/invoice documents so the content fills
// the A4 page nicely: few line items → larger font, many line items → smaller
// font. The largest font size that keeps the whole document on a single page
// is chosen; when the content cannot fit on one page even at the minimum size,
// the minimum is returned and the document paginates compactly across pages.

import { computeDocPages } from "./docPagination";

export const AUTO_FIT_MIN_FS = 6;
export const AUTO_FIT_MAX_FS = 16;
const A4_H = 1123;
const TOLERANCE = 0.25;

// Inline cross-origin images as data URLs so measured heights account for the
// logo/stamp (which would otherwise collapse to 0×0 before loading).
export async function inlineImages(container) {
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) return;
    try {
      const res = await fetch(src, { mode: "cors" });
      const blob = await res.blob();
      const dataUrl = await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(blob);
      });
      img.setAttribute("src", dataUrl);
    } catch { /* leave original src */ }
  }));
}

// `renderMeasure(fs)` must render the FULL document (all line items + totals +
// notes + terms) with template.body_font_size = fs into a live (off-screen) DOM
// node and return that wrapper element so block heights can be measured.
export async function autoFitBodyFontSize(renderMeasure) {
  let lo = AUTO_FIT_MIN_FS;
  let hi = AUTO_FIT_MAX_FS;
  let best = AUTO_FIT_MIN_FS;
  // Binary search for the largest font size that still fits on a single page.
  while (hi - lo > TOLERANCE) {
    const mid = (lo + hi) / 2;
    const wrapper = await renderMeasure(mid);
    const pages = computeDocPages(wrapper, A4_H);
    if (pages.length <= 1) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.round(best / TOLERANCE) * TOLERANCE;
}