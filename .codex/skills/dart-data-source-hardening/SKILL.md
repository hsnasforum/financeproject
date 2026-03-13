---
name: dart-data-source-hardening
description: Harden Finance Project changes that touch DART, public/open data, data-source settings, freshness, env, fallback, or partial-failure behavior. Trigger when tasks change DART routes, data-source status UI, upstream fetch logic, freshness messaging, or documented env usage.
---

# DART And Data Source Hardening

Use this skill for changes where external data quality, freshness, fallback handling, or operator guidance matters.

## Core goals

- Keep the UI usable when data is missing, delayed, partial, or failed
- Keep user-facing language easy to understand and non-absolute
- Separate facts, calculations, assumptions, and freshness state
- Avoid undocumented env names, fields, or hidden upstream assumptions

## Required workflow

1. Identify the upstream dependency:
   - DART
   - public/open data source
   - internal freshness or ping state
2. Check what happens in each failure mode:
   - env missing
   - request failure
   - timeout or delay
   - partial payload
   - stale snapshot
3. Confirm the screen or API route does not silently collapse.
4. Make sure user-visible copy matches actual behavior:
   - current state
   - 기준 시점 or freshness state
   - what is missing
   - what still works
5. If env names, data-source setup, or operator flow changed, update the matching docs or `/work` note.

## Guardrails

- Use only documented env names and known data contracts.
- Do not hardcode secrets or internal endpoints.
- Do not present stale or unverified market/policy data as a firm decision basis.
- If freshness matters, expose or preserve source date / checked-at date when the existing surface supports it.
- Prefer safe fallback or clear 안내 over silent success.

## Common checks

- Empty state is distinct from initial state
- Partial success is distinct from full success
- Freshness warning is distinct from hard failure
- Invalid query or corp code is rejected before unnecessary upstream calls
- Data-source settings screens still explain what is required vs optional

## Suggested verification

- Logic/helpers:
  - `pnpm test`
- Route/page/API handler:
  - `pnpm build`
- DART flow:
  - `pnpm e2e:rc:dart`
- Data-source settings flow:
  - `pnpm e2e:rc:data-sources`
- Broader public flow risk:
  - `pnpm e2e:rc`

## Output format

- 의존 데이터 소스
- 실패 모드 점검 결과
- 사용자 문구/상태 점검 결과
- 실행한 검증
- 남은 리스크
