import { useState, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";

// Keeps a report's filters (date range, account, compare options...) for the browser session so that
// opening an invoice/journal and pressing Back returns to the report exactly as it was.
// The saved value is only reused when the page URL query is the same as when it was saved.
export function usePersistedState(key, initial) {
  const { search } = useLocation();
  const k = "opr:state:" + key;
  const [val, setVal] = useState(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(k));
      if (s && s.s === search) return s.v;
    } catch (e) { /* ignore */ }
    return typeof initial === "function" ? initial() : initial;
  });
  const set = useCallback((n) => {
    setVal((prev) => {
      const v = typeof n === "function" ? n(prev) : n;
      try { sessionStorage.setItem(k, JSON.stringify({ s: search, v })); } catch (e) { /* ignore */ }
      return v;
    });
  }, [k, search]);
  return [val, set];
}

// Remembers the scroll position of the page (or its big scrolling container) and restores it once the
// report has loaded.
export function useScrollRestore(key, ready) {
  const k = "opr:scroll:" + key;
  useEffect(() => {
    const onScroll = (e) => {
      const t = e.target;
      try {
        if (t === document) {
          sessionStorage.setItem(k, JSON.stringify({ k: "doc", y: window.scrollY }));
        } else if (t && t.scrollHeight > t.clientHeight * 1.2 && t.clientHeight > 300) {
          sessionStorage.setItem(k, JSON.stringify({ k: "el", y: t.scrollTop, cls: String(t.className) }));
        }
      } catch (err) { /* ignore */ }
    };
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [k]);
  useEffect(() => {
    if (!ready) return;
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(k)); } catch (e) { /* ignore */ }
    if (!s || !s.y) return;
    const apply = () => {
      if (s.k === "doc") window.scrollTo(0, s.y);
      else {
        const el = [...document.querySelectorAll("*")].find((x) => String(x.className) === s.cls && x.scrollHeight > x.clientHeight);
        if (el) el.scrollTop = s.y;
      }
    };
    const t1 = setTimeout(apply, 150);
    const t2 = setTimeout(apply, 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [ready, k]);
}
