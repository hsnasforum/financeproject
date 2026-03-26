# 2026-03-26 v3 import-to-planning beta transactions-entry copy-cta-handoff implementation

## 변경 파일
- `src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx`
- `tests/planning-v3-transactions-batches-ui.test.tsx`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-transactions-entry-copy-cta-handoff-implementation.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: batch list consumer surface만 좁게 다루고, upload/list/detail reader contract와 writer owner를 건드리지 않는 범위를 유지하기 위해 사용.
- `planning-gate-selector`: page/link/UI text 변경과 user-flow 영향에 맞춰 `test + lint + build + e2e:rc + diff check`를 실행 세트로 고르기 위해 사용.
- `route-ssot-check`: `/planning/v3/transactions` redirect alias 유지, `/planning/v3/transactions/batches` entry surface 재정렬, `/planning/reports` handoff 문맥 유지가 current route SSOT와 충돌하지 않는지 확인하기 위해 사용.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 미실행 조건부 검증, 남은 리스크를 오늘 `/work` 형식으로 남기기 위해 사용.

## 변경 이유
- 전날 `Phase 1 kickoff alignment`에서 잠근 official beta entry overlay를 첫 실제 구현 배치로 옮길 필요가 있었다.
- 이번 라운드는 `/planning/v3/transactions`를 새 page로 승격하는 것이 아니라 redirect alias를 유지한 채 `/planning/v3/transactions/batches`가 실제 beta 시작 surface처럼 읽히게 만드는 것이 목적이었다.
- 따라서 existing upload/list contract, test id, route inventory는 유지하면서 copy, CTA hierarchy, handoff 문맥만 가장 작은 범위로 정리했다.

## 핵심 변경
- `TransactionsBatchListClient` 상단을 `Import-to-Planning Beta` 시작 surface로 재구성해 `최근 배치 확인 -> balances 확인 -> profile drafts 확인`이 primary CTA로 읽히게 했다.
- stable `/planning/reports`는 직접 entry가 아니라 preflight/apply 뒤 도착점이라는 handoff 안내를 상단 helper로 추가했다.
- `/planning/v3/accounts`, `/planning/v3/batches`, `/planning/v3/import/csv`는 `Support / Internal` 그룹으로 내려 official entry와 support tier가 섞이지 않게 했다.
- 기존 `data-testid="v3-upload-input"`, `data-testid="v3-upload-submit"`, `data-testid="v3-batch-list"`는 유지했고, `/planning/v3/transactions` redirect alias도 그대로 뒀다.
- `tests/planning-v3-transactions-batches-ui.test.tsx`를 추가해 official beta entry copy, primary handoff 링크, support/internal 링크 위계를 정적 렌더 기준으로 검증했다.

## 검증
- `pnpm test tests/planning-v3-transactions-page-redirect.test.ts tests/planning-v3-transactions-batches-ui.test.tsx`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `git diff --check -- src/app/planning/v3/transactions/page.tsx src/app/planning/v3/transactions/batches/page.tsx src/app/planning/v3/transactions/_components/TransactionsBatchListClient.tsx tests/planning-v3-transactions-page-redirect.test.ts tests/planning-v3-transactions-batches-ui.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-transactions-entry-copy-cta-handoff-implementation.md`
- `pnpm lint`는 exit code 0으로 통과했고, 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- [미실행] `pnpm planning:current-screens:guard` — route inventory/classification 자체를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 entry surface의 copy/CTA hierarchy만 정리했고, 실제 `/planning/v3/transactions/batches/[id] -> balances -> profile/drafts -> preflight/apply` follow-through copy 일관성은 다음 배치에서 더 맞춰야 할 수 있다.
- `pnpm lint`의 경고 25건은 이번 변경과 무관한 기존 상태라 그대로 남겼다.
- `/planning/v3/start`와 raw `/planning/v3/batches`, `/planning/v3/import/csv`의 역할 구분은 UI tier에서만 낮췄고, broader v3 onboarding 구조 재정의는 여전히 비범위다.
