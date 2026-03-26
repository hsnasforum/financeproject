# 2026-03-26 v3 import-to-planning beta batch-detail-to-balances-profile-drafts handoff copy alignment implementation

## 변경 파일
- `src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx`
- `src/app/planning/v3/balances/_components/BalancesClient.tsx`
- `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
- `tests/planning-v3-profile-drafts-ui.test.tsx`
- `tests/planning-v3-import-followthrough-ui.test.tsx`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-batch-detail-to-balances-profile-drafts-handoff-copy-alignment-implementation.md`

## 사용 skill
- `planning-v3-batch-contract-narrowing`: batch detail, balances, draft profile consumer surface의 copy/CTA만 좁게 맞추고 owner contract, fetch shape, 계산 로직을 건드리지 않기 위해 사용.
- `planning-gate-selector`: UI text, page-level CTA, user-flow 영향에 맞춰 UI 테스트, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `git diff --check -- ...`를 실행 세트로 고르기 위해 사용.
- `route-ssot-check`: `/planning/v3/transactions/batches/[id]` deep-link only 성격, `/planning/v3/balances`와 `/planning/v3/profile/drafts` official entry 성격, stable `/planning/reports` handoff destination 문맥이 current route SSOT와 충돌하지 않는지 확인하기 위해 사용.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 미실행 조건부 검증, 남은 리스크를 오늘 `/work` 표준 형식으로 남기기 위해 사용.

## 변경 이유
- 직전 라운드에서 `/planning/v3/transactions/batches` entry surface는 정리됐지만, 다음 단계인 batch detail -> balances -> profile drafts -> preflight/apply -> stable report handoff copy는 아직 일관되게 읽히지 않았다.
- 특히 batch detail 상단에서는 official funnel route와 raw/support route가 같은 tier로 보였고, balances와 drafts도 representative funnel 안에서의 역할이 충분히 드러나지 않았다.
- 이번 라운드는 데이터 계약이나 계산 로직이 아니라, follow-through surface의 copy/CTA hierarchy만 smallest safe batch로 정리하는 것이 목적이었다.

## 핵심 변경
- `TransactionBatchDetailClient` 상단을 deep-link only 배치 상세/보정 surface로 다시 설명하고, primary CTA를 `official entry로 돌아가기 -> balances 확인 -> profile drafts 검토`로 재배치했다.
- 같은 화면에서 `/planning/v3/accounts`, `/planning/v3/categories/rules`, `/planning/v3/import/csv`는 `Support / Internal` 그룹으로 내리고, stable `/planning/reports`는 preflight/apply 뒤 도착점이라는 helper 안내로만 남겼다.
- `BalancesClient` hero와 조회 기준 영역에 `projection 확인 축 -> 다음 단계 profile drafts 검토` 문맥을 추가하고, `계좌 관리`는 primary action에서 support action으로 낮췄다.
- `ProfileDraftsListClient` 상단을 stable handoff 직전 검토 축으로 다시 쓰고, primary action은 `balances 다시 확인`, `최근 배치 확인`으로 두고 raw `/planning/v3/import/csv`, raw `/planning/v3/batches`는 `Support / Internal` 그룹으로 내렸다.
- `tests/planning-v3-profile-drafts-ui.test.tsx`를 확장하고 `tests/planning-v3-import-followthrough-ui.test.tsx`를 추가해 batch detail, balances, drafts handoff copy와 support/internal tier 분리를 정적 렌더 기준으로 검증했다.

## 검증
- `pnpm test tests/planning-v3-profile-drafts-ui.test.tsx tests/planning-v3-import-followthrough-ui.test.tsx`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`
- `git diff --check -- src/app/planning/v3/transactions/batches/[id]/page.tsx src/app/planning/v3/transactions/[id]/_components/TransactionBatchDetailClient.tsx src/app/planning/v3/balances/_components/BalancesClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx tests/planning-v3-profile-drafts-ui.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-batch-detail-to-balances-profile-drafts-handoff-copy-alignment-implementation.md`
- `pnpm lint`는 exit code 0으로 통과했고, 저장소 기존 unused-var warning 25건은 그대로 남아 있다.
- [미실행] `pnpm planning:current-screens:guard` — route inventory/classification 자체를 바꾸지 않아 실행하지 않았다.
- [미실행] `pnpm planning:ssot:check` — route policy/catalog guard를 바꾸지 않아 실행하지 않았다.

## 남은 리스크
- 이번 라운드는 handoff copy/CTA hierarchy만 정리했고, `/planning/v3/profile/drafts/[id]` 상세와 `/planning/v3/profile/drafts/[id]/preflight` 상단 wording까지 같은 톤으로 맞추는 후속 round는 여전히 남아 있다.
- `TransactionBatchDetailClient` 내부 거래 보정, cashflow, draft create 섹션의 기능 계약은 그대로 유지했기 때문에, user가 실제로 느끼는 follow-through 품질은 이후 detail/preflight surface copy 정리 여부에 더 영향을 받을 수 있다.
- `pnpm lint`의 warning 25건은 이번 변경과 무관한 기존 상태라 그대로 남겼다.
