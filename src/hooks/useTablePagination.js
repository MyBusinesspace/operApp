import { useState, useEffect } from "react";

/**
 * Client-side pagination for a filtered/sorted table array.
 * Returns the current page slice plus controls for the DataTablePagination footer.
 *
 * @param {Array} items  The full filtered/sorted array to paginate.
 * @param {number} initialPageSize  Default page size (default 100).
 */
export function useTablePagination(items, initialPageSize = 100) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset to the first page whenever the result count changes (filters / search).
  useEffect(() => { setPage(1); }, [totalItems]);

  // Keep page in range when the page size changes.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]);

  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  const setPageSizeAndReset = (size) => {
    setPageSize(size);
    setPage(1);
  };

  return {
    page: currentPage,
    setPage,
    pageSize,
    setPageSize: setPageSizeAndReset,
    totalItems,
    totalPages,
    pageItems,
    range: {
      from: totalItems === 0 ? 0 : start + 1,
      to: Math.min(start + pageSize, totalItems),
    },
  };
}