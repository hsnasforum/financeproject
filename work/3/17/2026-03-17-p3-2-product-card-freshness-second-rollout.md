# 2026-03-17 P3-2 product card freshness second rollout

## 변경 파일
- `src/components/ProductListPage.tsx`
- `src/components/products/ProductRowItem.tsx`
- `src/components/products/ProductOptionRowItem.tsx`
- `src/lib/finlife/types.ts`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/17/2026-03-17-p3-2-product-card-freshness-second-rollout.md`

## 사용 skill
- `planning-gate-selector`: `/products` 결과 UI와 타입만 바꾼 라운드라 `pnpm build`와 diff check만으로 검증 범위를 작게 고정하는 데 사용.
- `dart-data-source-hardening`: `finlife` snapshot/fallback/source status를 다루는 만큼 explicit 값만 노출하고, row 조회 실패 시 카드 메타가 과장되거나 collapse하지 않도록 실패 모드를 점검하는 데 사용.
- `work-log-closeout`: 오늘 날짜 `/work` 경로에 실제 변경 파일, 실행한 검증, 남은 리스크를 closeout 형식으로 정리하는 데 사용.

## 변경 이유
- `P3-2` 문서 기준 second rollout 대상은 `/products/deposit`, `/products/saving` 결과 카드/행이었고, page-level `snapshotStatus`만으로는 각 카드가 어떤 기준 시각과 fallback 상태를 읽어야 하는지 카드 단위로 드러나지 않았습니다.
- 사용자 화면에서는 운영성 배너를 다시 도입하지 않고, 기존 FINLIFE payload와 source status row에서 재사용 가능한 최소 freshness 메타만 작게 붙여야 했습니다.

## 핵심 변경
- `ProductListPage`에서 `deposit/saving`일 때만 `/api/sources/status`를 읽고, `finlife` + route kind 기준 row를 찾아 shared `cardFreshnessMeta`를 한 번 계산하도록 추가했습니다.
- `lastSyncedAt`은 `payload.meta.snapshot.generatedAt`를 우선 사용하고, 없을 때만 `finlife` source status row의 `lastSyncedAt`를 보조로 읽었습니다.
- `freshnessStatus`는 `finlife` source status row가 있을 때만 `ok/stale/error/empty`로 계산했고, row가 없으면 억지로 채우지 않았습니다.
- `fallbackMode`는 `meta.fallback.mode`, `mode === "mock"`, `fallbackUsed + source === "snapshot/live_partial"`처럼 explicit 값이 있을 때만 `캐시 기준`, `예시 데이터 기준`, `스냅샷 기준`, `부분 수집 기준`으로 노출했습니다.
- `payload.meta.note`는 raw 운영 메모를 그대로 내보내지 않고, 기술적인 `kind=...`, `reason=...`, `fromFile replay` 패턴은 버리고 사용자용으로 안전한 경우만 `유의:` 한 줄로 제한했습니다.
- 이 메타를 `ProductRowItem`, `ProductOptionRowItem`, grouped option header에 작은 chip/helper 수준으로 연결했고, 기존 상단 `snapshotStatus` 요약과 error/empty state는 그대로 유지했습니다.

## 검증
- `pnpm build`
- `git diff --check -- src/components/ProductListPage.tsx src/components/products/ProductRowItem.tsx src/components/products/ProductOptionRowItem.tsx src/lib/finlife/types.ts analysis_docs/v2/financeproject_next_stage_plan.md work/3/17/2026-03-17-p3-2-product-card-freshness-second-rollout.md`

## 남은 리스크
- `/products` second rollout은 `deposit/saving`만 대상으로 고정했고, `pension`/대출류는 이번 라운드에서 card freshness meta를 붙이지 않았습니다.
- grouped option view는 header 수준 메타만 추가했고, 내부 표 행마다 별도 freshness를 반복하지는 않았습니다.
- `payload.meta.note`가 기술적이면 의도적으로 숨기므로, 일부 경우에는 `lastSyncedAt`과 `fallbackMode`만 보이고 assumption note는 비어 있을 수 있습니다.
