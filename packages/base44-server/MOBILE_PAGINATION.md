# Mobile pagination on the Vercel backend

Base44 function sources under `base44/functions/**` are **never** edited.
Paging lives in the compat layer (`packages/base44-server`).

When the mobile app talks to Vercel and the request includes `skip` (or `page`),
the compat layer returns one server page plus `has_more` / `next_skip`.
Without `skip`, original Base44 handlers keep their previous behaviour.

| Call | When it pages | Extra response fields |
| --- | --- | --- |
| `apiAuth?action=entityQuery` | Always on Vercel (replaces Base44 handler) | `has_more`, `next_skip`, `skip`, `limit` |
| `apiTimesheet` `get_entries` | Body includes `skip` or `page` | same |
| `apiTimesheet` `get_tasks` | Body includes `skip` or `page` | same |

On Base44 cloud: **never send `skip`** — Base44 would ignore it and return the
same first page forever if the client loops.

## Infinite scroll (Tasks)

On Vercel the Tasks screen loads **10** tasks per request and appends the next
page when the user scrolls near the bottom (no Previous/Next bar).

```dart
await timesheet.getAssignedTasksPage(
  employeeId: id,
  limit: 10,
  skip: nextSkip,
);
// append page.items; continue while has_more
```

Base44 path: one request without `skip` (up to ~200 tasks).
