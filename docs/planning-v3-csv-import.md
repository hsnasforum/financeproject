# Planning V3 CSV Import API

## Endpoint
- `POST /api/planning/v3/import/csv`

## Request Contract
- `Content-Type: application/json`
- Body:
```json
{
  "csvText": "date,amount,desc\n2026-01-01,1000,salary",
  "mapping": {
    "date": "date",
    "amount": "amount",
    "desc": "desc"
  }
}
```
- `mapping` is optional. If omitted, header aliases are used.
- Legacy `text/csv` and `text/plain` body is still accepted for backward compatibility.

## Response Contract
- Success (`200`):
```json
{
  "ok": true,
  "data": {
    "draftPatch": {},
    "monthlyCashflow": [],
    "meta": { "rows": 0, "months": 0 }
  }
}
```
- Error (`4xx/5xx`):
```json
{
  "ok": false,
  "error": {
    "code": "INPUT|PARSE|LIMIT|INTERNAL",
    "message": "..."
  }
}
```

## Limits
- Maximum CSV payload size: `1MB` (`413`, `error.code="LIMIT"` when exceeded).
- Empty or whitespace-only input is rejected (`400`, `error.code="INPUT"`).

## Privacy / No-Storage Policy
- This route is **draft-only** and does not write to v2 profile/run stores.
- Raw CSV text and raw transaction rows are not returned in API payloads.
- Parse failures are summarized as codes/counts only; raw row text is never included.
