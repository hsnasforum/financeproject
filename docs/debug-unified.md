# Debug Unified Runbook

## 1) Offline seed (no network)

Run:

```bash
pnpm seed:debug
```

This replays local fixtures into DB:

- FINLIFE: `tests/fixtures/finlife_deposit.normalized.json` (if file exists)
- KDB: `tests/fixtures/kdb-deposit.sample.xml` (if file exists)

No ServiceKey or upstream URL is printed.

## 2) Open debug UI

Open:

- `/debug/unified?kind=deposit&includeSources=datago_kdb`

Check:

- Source badges and NEW/UPDATED/TOUCHED flags
- Progress card (`counts / totalCount / %`)
- Search `q`
- Search mode `qMode` (`contains` / `prefix`)

## 3) Paging/Search policy

- Single source only:
  - Select one source (`finlife` or `datago_kdb`)
  - `Load more` uses cursor paging
- Multi source:
  - Global cursor is not supported
  - Use `limit + q` for exploration

## 4) onlyNew / changedSince

- `onlyNew=1` uses each source run baseline:
  - external sources: `snapshot.metaJson.lastRun.startedAt`
  - finlife: snapshot generated time baseline
- `changedSince=<ISO>` filters by `firstSeenAt` or `updatedAt`

## 5) Notes for large datasets

- totalCount가 큰 경우 progress가 초기에 낮게 보일 수 있습니다.
- Prefer:
  - `q` narrowing first
  - single-source cursor paging for deep inspection

KDB note:

- KDB upstream is XML and normal success code is `resultCode=0` with `resultMsg=NORMAL_CODE`.

## 6) FINLIFE offline replay

Online environment (optional dump creation):

```bash
pnpm finlife:sync --kind=deposit --inspect
```

This writes:

- `artifacts/finlife_deposit.normalized.v1.json`

Compressed dump:

```bash
pnpm finlife:sync --kind=deposit --inspect --gzip
```

This writes:

- `artifacts/finlife_deposit.normalized.v1.json.gz`

Offline replay:

```bash
pnpm finlife:sync --kind=deposit --fromFile=artifacts/finlife_deposit.normalized.v1.json
```

`--fromFile` checks `schemaVersion`.

- missing `schemaVersion` => treated as v1 (backward compatible)
- unsupported version => fails with guidance to regenerate via `--inspect`

Backfill existing rows without re-sync:

```bash
pnpm finlife:backfill-norms
```

Prune old artifacts (keep latest 10):

```bash
pnpm artifacts:prune
```

Refresh small fixture from dump:

```bash
pnpm fixtures:refresh:finlife
```

Before committing fixtures/dumps:

```bash
pnpm validate:dumps
```

Fast pre-commit/CI path:

```bash
pnpm verify
```

Lint warnings location:

- `pnpm lint` output

Notes:

- Dump file contains normalized payload only (no API key, no request URL/header).
- Keep artifacts out of git.

## 7) Live API final verification (local PC)

Run in order:

```bash
pnpm prisma:generate
pnpm prisma db push
pnpm live:smoke
```

Then check:

- `/api/sources/status`
- `/debug/unified` (FINLIFE/KDB badges + NEW/UPDATED/TOUCHED)

If needed, run full sync:

```bash
pnpm live:sync
```

`live:smoke` and `live:sync` write report files:

- `artifacts/live-verify-YYYYMMDD-HHmmss.json`

lint 경고는 `pnpm lint` 출력에서 확인 가능 (`pnpm exec eslint .` 또는 `pnpm exec eslint . --max-warnings=0`).

앱 상단 Data Freshness 배너는 stale/실패 감지용이며 자동 sync를 수행하지 않습니다.
갱신은 수동으로 `pnpm live:smoke` 또는 `pnpm live:sync`를 실행한 뒤 배너의 `재확인`으로 상태를 다시 조회하세요.
`/products/deposit`에서는 FINLIFE는 required, KDB는 optional(참고)로 표시되며 `?strict=1` 또는 `?freshness=strict`로 optional도 required 판정을 강제할 수 있습니다.
INFO(옵션 소스 stale)는 `/products/deposit`, `/recommend`에서 compact로 축약 표시되어 노이즈를 줄입니다.
`/api/sync/smoke`는 개발/로컬 환경 전용이며 Origin/Host 검증을 통과한 요청만 실행됩니다.
포트포워딩/프록시 환경에서 403이면 `x-forwarded-host` 전달 설정을 확인하고, Origin 없는 요청은 필요 시 `ALLOW_LOCAL_SYNC=1`에서만 허용됩니다.

Report includes:

- step success/failure and duration
- DB counts before/after and deltas
