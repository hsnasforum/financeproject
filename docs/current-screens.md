# 현재 제공 화면/기능 카탈로그 (v1.0 RC)

기준일: 2026-03-09
기준 소스: `src/app/**/page.tsx`

## Public IA 기준 (2026-03-16)
- 상위 메뉴는 아래 5개 축으로 고정한다.
- `홈/대시보드` → 대표 경로 `/dashboard`
- `재무진단` → 대표 경로 `/planning`
- `상품추천` → 대표 경로 `/recommend`
- `금융탐색` → 대표 경로 `/products` (`/products/catalog`, `/public/dart`, `/benefits`, `/housing/*`, `/tools/fx` 포함)
- `내 설정` → 대표 경로 `/settings` (`/settings/data-sources`, `/settings/backup`, `/settings/alerts` 포함)
- 위 기준은 Public navigation/홈 바로가기의 상위 IA 기준이며, 개별 세부 경로 분류와 노출 정책은 별도 route policy에서 관리한다.

## Route Policy 분류 기준
- `Public Stable`: 사용자 문서, 헤더, 홈 바로가기에서 기본 노출 가능한 공식 경로
- `Public Beta`: 실험 또는 preview 성격이 남아 있어 기본 메뉴에는 올리지 않되 공개 검토가 가능한 경로
- `Legacy Redirect`: 공식 경로가 아니며 안정 경로로 즉시 보내는 호환용 진입점
- `Local-only Ops`: 운영자나 로컬 실행 환경 전용 경로
- `Dev/Debug`: 개발 확인용 경로. production 사용자 노출 금지

## Public 화면 (Public Stable / production 노출)
- `/` (홈, 핵심 바로가기만 제공)
- `/dashboard` (메인 진입점)
- `/benefits`
- `/compare`
- `/gov24`
- `/help`
- `/housing/afford`
- `/housing/subscription`
- `/invest/companies`
- `/feedback`
- `/feedback/list`
- `/feedback/[id]`
- `/planning`
- `/planning/runs`
- `/planning/runs/[id]`
- `/planning/reports`
- `/planning/reports/[id]`
- `/planning/trash`
- `/products`
- `/products/catalog`
- `/products/catalog/[id]`
- `/products/deposit`
- `/products/saving`
- `/products/pension`
- `/products/mortgage-loan`
- `/products/rent-house-loan`
- `/products/credit-loan`
- `/products/compare`
- `/public/dart`
- `/public/dart/company`
- `/recommend`
- `/recommend/history`
- `/settings`
- `/settings/alerts`
- `/settings/backup`
- `/settings/data-sources`
- `/settings/maintenance`
- `/settings/recovery`
- `/tools/fx`

## 경계 메모
- `/planning/reports`, `/planning/reports/[id]`, `/planning/runs`는 공식 planning run/report 경로다.
- `/report`는 legacy redirect 경로이며 공식 planning report 경로와 구분해서 다룬다.
- `/report` 진입은 현재 `/planning/reports` 또는 `/planning/reports?runId=...`로 `permanentRedirect` 된다.
- `/planning/v3/*`와 `/planning/reports/prototype`는 공개 검토가 필요한 `Public Beta`로 취급한다.
- `/ops/*`, `/dashboard/artifacts`, `/debug/*`, `/dev/*`는 사용자 문서/헤더/홈 바로가기 노출 대상이 아니다.

## Legacy/Redirect 화면
- `/report` (legacy redirect, `/planning/reports`로 영구 이동)
- `/planner` (legacy redirect, `/planning`으로 이동)
- `/planner/[...slug]` (legacy redirect, 지원되는 planning 하위 경로는 suffix 유지, 그 외는 `/planning`으로 이동)

## Prototype/Preview 화면 (Public Beta)
- `/planning/reports/prototype` (기본 진입은 `/planning/reports`로 리다이렉트, `preview=1`일 때만 프로토타입 표시)

## Planning v3 화면 (Public Beta / experimental / in-progress)
- `/planning/v3/accounts`
- `/planning/v3/balances`
- `/planning/v3/batches`
- `/planning/v3/batches/[id]`
- `/planning/v3/categories/rules`
- `/planning/v3/drafts`
- `/planning/v3/drafts/[id]`
- `/planning/v3/drafts/profile`
- `/planning/v3/exposure`
- `/planning/v3/import/csv`
- `/planning/v3/journal`
- `/planning/v3/news`
- `/planning/v3/news/alerts`
- `/planning/v3/news/explore`
- `/planning/v3/news/settings`
- `/planning/v3/news/trends`
- `/planning/v3/profile/draft`
- `/planning/v3/profile/drafts`
- `/planning/v3/profile/drafts/[id]`
- `/planning/v3/profile/drafts/[id]/preflight`
- `/planning/v3/scenarios`
- `/planning/v3/start`
- `/planning/v3/transactions`
- `/planning/v3/transactions/batches`
- `/planning/v3/transactions/batches/[id]`

## Ops/Admin 화면 (Local-only Ops / local-only 또는 packaged runtime)
- `/ops`
- `/ops/about`
- `/ops/assumptions`
- `/ops/assumptions/history`
- `/ops/audit`
- `/ops/auto-merge`
- `/ops/auto-merge/policy`
- `/ops/backup`
- `/ops/doctor`
- `/ops/feedback/planning`
- `/ops/labels`
- `/ops/metrics`
- `/ops/planning`
- `/ops/planning-cache`
- `/ops/planning-cleanup`
- `/ops/planning-eval`
- `/ops/rules`
- `/ops/runs`
- `/ops/security`
- `/ops/support`

## Dev/Debug 화면 (production 404)
- `/dashboard/artifacts`
- `/debug/planning-v2`
- `/debug/unified`
- `/dev/data`
- `/dev/finlife/schema`
- `/dev/git`
- `/dev/public-apis`

## API 노출 규칙
- `/api/dev/*`는 production에서 공통 차단(404)된다.

## 정합성 체크 규칙
- 헤더/홈/문서의 내부 링크(`href`)는 반드시 위 실존 경로만 가리킨다.
- Ops 계열 경로(`/ops/*`)는 public 기능 안내가 아니라 local-only 또는 packaged runtime 기준 운영 화면으로 취급한다.
- Dev/Debug 경로는 운영 문서/사용자 안내에서 기본 노출하지 않는다.
- `pnpm planning:current-screens:guard`는 이 문서와 실제 route 집합을 테스트로 비교하는 체크다.
- `pnpm planning:ssot:check`는 `node scripts/planning_ssot_guard.mjs && pnpm planning:current-screens:guard` 순서로 실행된다.
- `scripts/planning_ssot_guard.mjs`는 `src/lib/planning/**`에서 `Math.round/Math.floor` 직접 사용, `core/v2/debt/calc` 직접 import, `lib/finlife/calculators` 직접 import를 기본 금지한다.
- 현재 예외는 `src/lib/planning/calc/**` 전체와 `src/lib/planning/v2/debt/coreCalc.ts`의 `core/v2/debt/calc` import 1건만 허용한다.
