# Routes Inventory

기준: Planning v2 사용자 공개 URL 최소화, 운영/디버그는 로컬 개발자 전용.

## A) 사용자 메뉴 URL (공개 최소)
- `/planning`
- `/planning/runs`

## A-2) 사용자 직접 접근 URL (메뉴 비노출)
- `/planning/reports` (실행 기록 기반 리포트 허브)

## B) 운영자용 URL (로컬 전용)
- `/ops`
- `/ops/assumptions`
- `/ops/planning`
- `/ops/planning-cache`
- `/ops/planning-cleanup`
- `/ops/security`

## C) 내부 API (요약)

### `/api/planning/v2/*`
- `/api/planning/v2/simulate`
- `/api/planning/v2/scenarios`
- `/api/planning/v2/monte-carlo`
- `/api/planning/v2/actions`
- `/api/planning/v2/debt-strategy`
- `/api/planning/v2/optimize`
- `/api/planning/v2/profiles`
- `/api/planning/v2/profiles/[id]`
- `/api/planning/v2/runs`
- `/api/planning/v2/runs/[id]`
- `/api/planning/v2/runs/[id]/export`
- `/api/planning/v2/runs/[id]/report`
- `/api/planning/v2/runs/[id]/report.pdf`
- `/api/planning/v2/reports`
- `/api/planning/v2/reports/[id]`
- `/api/planning/v2/reports/[id]/download`
- `/api/planning/v2/share-report`
- `/api/planning/v2/share-report/[id]/download`
- `/api/planning/v2/trash`
- `/api/planning/v2/trash/restore`
- `/api/planning/v2/trash/empty`

### `/api/ops/*`
- `/api/ops/assumptions/latest`
- `/api/ops/assumptions/sync`
- `/api/ops/assumptions/history`
- `/api/ops/assumptions/history/[id]`
- `/api/ops/assumptions/set-latest`
- `/api/ops/planning-cache/stats`
- `/api/ops/planning-cache/purge`
- `/api/ops/planning/doctor`
- `/api/ops/security/status`
- `/api/ops/security/configure`
- `/api/ops/security/unlock`
- `/api/ops/security/lock`
- `/api/ops/security/auto-lock`
- `/api/ops/security/change-passphrase`
- `/api/ops/auto-merge/eligibility`

## D) 레거시/디버그/개발자 전용
- `/debug/*`: 개발자 전용. `PLANNING_DEBUG_ENABLED=false`가 기본이며 localhost 요청에서만 접근 허용.
- `/dev/*`: 개발용 페이지. production 비노출 정책 유지.

## E) Top-level Route Roots (문서 동기화용)
- `/api`
- `/benefits`
- `/compare`
- `/dashboard`
- `/debug`
- `/dev`
- `/feedback`
- `/gov24`
- `/help`
- `/housing`
- `/invest`
- `/ops`
- `/planning`
- `/products`
- `/public`
- `/recommend`
- `/report`
- `/settings`
- `/tools`
