# Mobile pagination on the Vercel backend

Base44 function sources under `base44/functions/**` are never edited. When the
app talks to this deployment, two actions gain real server paging:

| Call | When it pages | Extra response fields |
| --- | --- | --- |
| `apiAuth?action=entityQuery` | Always on Vercel (replaces Base44 handler) | `has_more`, `next_skip`, `skip`, `limit` |
| `apiTimesheet` `get_entries` | Only if body includes `skip` (or `page`) | same |

On Base44, keep the existing behaviour (no `skip` / ignore paging fields).

## Flutter sketch

```dart
final usePaging = AppConfig.useVercelBackend;
var skip = 0;
const pageSize = 50;
final all = <TimeEntry>[];

while (true) {
  final response = await client.dio.post(AppConfig.timesheetFunctionUrl, data: {
    'action': 'get_entries',
    'limit': pageSize,
    if (usePaging) 'skip': skip,
    // ... date_from / date_to / scope
  });
  final map = Map<String, dynamic>.from(response.data as Map);
  final batch = (map['entries'] as List? ?? []);
  all.addAll(batch.map(...));

  if (!usePaging) break;
  if (map['has_more'] != true) break;
  skip = map['next_skip'] as int? ?? (skip + batch.length);
}
```

For repositories that go through `entityQuery`:

```dart
await repo.list(sort: '-created_date', limit: 50, skip: usePaging ? skip : null);
// response envelope from Vercel includes has_more / next_skip on the raw POST
```

`EntityRepository._proxyQuery` already forwards `skip` / `limit` in the body.
