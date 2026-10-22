export const formatWhen = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export const modeLabel = (mode) => (mode === "full" ? "full mirror" : "incremental");