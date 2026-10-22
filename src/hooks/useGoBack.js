import { useNavigate, useLocation } from "react-router-dom";

/**
 * Returns a function that navigates back to the previous in-app page when one
 * exists, otherwise falls back to the provided route. Useful for detail pages
 * reachable from multiple lists (e.g. a contact opened from Invoices, Quotes,
 * Bills or Purchase Orders) so the Back button returns to where the user came
 * from instead of always jumping to the canonical list page.
 */
export function useGoBack(fallback = "/") {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };
}