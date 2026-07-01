# 2026-06-28 P2-03 unified source loaders

## 변경 파일
- `src/lib/sources/unified.ts`
- `src/lib/sources/unifiedLoaders.ts`
- `src/lib/sources/unifiedTypes.ts`
- `tests/unified-source-loaders.test.ts`
- `work/6/28/2026-06-28-p2-03-unified-loader-adapter-plan.md`
- `work/6/28/2026-06-28-p2-03-unified-source-loaders.md`

## 사용 skill
- `work-log-closeout`: 변경 파일, 실행 검증, 남은 리스크를 저장소 표준 `/work` 형식으로 남기기 위해 사용했습니다.

## 변경 이유
- 통합 Markdown P2-03 요구에 따라 `src/lib/sources/unified.ts`에 섞여 있던 Finlife, KDB, samplebank refresh/query/mapping/pagination 책임을 작은 source loader adapter로 분리하기 위함입니다.
- 중앙 unified service는 loader 선택, integrated canonical enrichment, merge/sort/depositProtection policy만 담당하도록 줄여 새 source 추가 시 중앙 분기를 최소화해야 했습니다.
- DB/network 없이 merge와 deposit protection 정책을 검증할 수 있는 fake-loader 회귀 테스트가 필요했습니다.

## 핵심 변경
- `UnifiedInputError`, `UnifiedProductView`, `UnifiedResult`, `UnifiedProductsInput` 등을 `src/lib/sources/unifiedTypes.ts`로 분리해 loader와 service가 순환 의존 없이 같은 계약을 쓰게 했습니다.
- `src/lib/sources/unifiedLoaders.ts`를 추가해 Finlife, KDB, samplebank별 `refreshIfNeeded`와 `query`를 구현하고 source별 row mapping과 cursor/pagination을 loader 내부로 옮겼습니다.
- `getUnifiedProductsWithLoaders`를 추가해 fake loader를 주입할 수 있게 했고, 기존 `getUnifiedProducts`는 기본 loader registry를 사용하는 wrapper로 유지했습니다.
- `src/lib/sources/unified.ts`의 목록 조회용 Prisma/provider 직접 분기를 제거하고 integrated enrichment, merge, depositProtection 적용만 남겼습니다.
- `tests/unified-source-loaders.test.ts`를 추가해 merged fake loader 병합, P1-06 depositProtection=require 유지, single-source cursor 위임을 DB/network 없이 검증했습니다.

## 검증
- 수정 전 실패 확인: `corepack pnpm test tests/unified-source-loaders.test.ts` → FAIL, `getUnifiedProductsWithLoaders is not a function`.
- `corepack pnpm test tests/unified-source-loaders.test.ts` → PASS, 1 file / 2 tests.
- `corepack pnpm test tests/products-unified-route.test.ts tests/unified-mode-validation.test.ts tests/unified-enrich.test.ts tests/unified-dedup-stability.test.ts tests/unified-samplebank.test.ts tests/unified-cursor.test.ts tests/unified-contract.test.ts` → PASS, 7 files / 19 tests.
- `corepack pnpm test tests/unified-item-route.test.ts tests/planning-v2-api/products-candidates-route.test.ts` → PASS, 2 files / 6 tests. `products-candidates` 테스트의 catalog unavailable stderr는 해당 테스트가 기대하는 fallback 경로입니다.
- 최종 묶음: `corepack pnpm test tests/unified-source-loaders.test.ts tests/products-unified-route.test.ts tests/unified-mode-validation.test.ts tests/unified-enrich.test.ts tests/unified-dedup-stability.test.ts tests/unified-samplebank.test.ts tests/unified-cursor.test.ts tests/unified-contract.test.ts tests/unified-item-route.test.ts tests/planning-v2-api/products-candidates-route.test.ts` → PASS, 10 files / 27 tests.
- `corepack pnpm typecheck` → PASS.
- `corepack pnpm lint` → PASS.
- `git diff --check` → PASS.

## 남은 리스크
- `getUnifiedProductById`는 아직 상세 조회용 source lookup/merge를 직접 들고 있습니다. 이번 P2-03은 목록 API loader 경계에 한정했고, item 조회 loader화는 후속 구조 개선 후보입니다.
- merged mode는 이제 source loader의 pagination/mapping 경로를 공통으로 사용합니다. API 응답 포맷은 유지했지만, 실제 DB 데이터에서 `onlyNew`/`changedSince`와 source별 tie ordering의 세부 결과는 운영 데이터로 추가 smoke를 돌릴 여지가 있습니다.
- migration, 저장 포맷, quarantine 대상은 없습니다. rollback은 이 커밋을 되돌리면 기존 중앙 unified 목록 조회 구현으로 복귀하는 코드 수준 rollback입니다.
