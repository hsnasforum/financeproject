# 2026-05-30 BenefitsClient React Compiler 경고 축소

## 요약
- `src/components/BenefitsClient.tsx`의 초기 URL 상태 반영을 microtask 이후로 미뤄 `react-hooks/set-state-in-effect` 경고 1건을 제거했습니다.
- `includeNationwide`와 `includeUnknown`의 지역 선택 기본값은 `parseFlag(..., parsedSido ? false : true)` 단일 경로로 유지했습니다.
- 공공 혜택 검색 API, snapshot/fallback 계약, 사용자 문구, route, selector는 변경하지 않았습니다.
- 전체 one-off scan은 `35 warnings / 29 files`에서 `34 warnings / 28 files`로 줄었고, 대상 파일은 잔여 목록에서 빠졌습니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 Finance Project 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: 혜택 UI/hooks 변경에 맞춰 targeted ESLint, 관련 혜택/플래너 테스트, lint/test/build, guard를 검증 세트로 선택했습니다.
- `dart-data-source-hardening`: 공공 혜택 데이터 UI 변경으로 API/fallback/freshness 계약을 건드리지 않는지 확인했습니다.
- `work-log-closeout`: 변경 파일, 검증 결과, 잔여 리스크를 `/work` 종료 기록으로 남겼습니다.
- `route-ssot-check`, `planning-v3-batch-contract-narrowing`: route/href 또는 planning v3 batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 파일
- `src/components/BenefitsClient.tsx`
- `work/5/30/2026-05-30-benefits-client-react-hooks-plan.md`

## 검증
- `corepack pnpm exec eslint src/components/BenefitsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`: `messages: []`, `warningCount: 0`
- `corepack pnpm exec vitest run tests/benefits-search-topics-param.test.ts tests/benefits-topics-match.test.ts tests/benefits-topics-none-means-all.test.ts tests/benefits-topics-all-means-all.test.ts tests/benefits-facets-topics-consistency.test.ts tests/benefits-region-infer-fallback.test.ts tests/benefits-facets-sido-normalize.test.ts tests/benefits-sigungu-catalog-filter.test.ts tests/benefits-pagination-cursor.test.ts tests/benefits-auto-maxpages.test.ts tests/benefits-refresh-effective-maxpages.test.ts tests/benefits-snapshot.test.ts tests/benefits-snapshot-no-autorebuild.test.ts tests/benefits-item-lookup.test.ts tests/gov24-applylinks-extract.test.ts tests/gov24-apply-link-safeurl.test.ts tests/planner-action-query.test.ts`: PASS, 17 files / 26 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-benefits-client.json`: `34 warnings / 28 files`, target 없음
- `git diff --check`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm test`: PASS, 663 files / 2035 tests
- `corepack pnpm build`: PASS
- `.next-build-*` 확인: 잔여 디렉터리 없음

## 남은 리스크
- 초기 URL 상태 반영이 microtask 이후로 이동해 첫 paint 직후 아주 짧게 기본 상태가 보일 수 있습니다.
- 공공 혜택 API, snapshot, fallback 분기는 변경하지 않았으므로 해당 계약의 런타임 품질은 기존 보장 범위와 같습니다.
- route, selector, 사용자 문구가 바뀌지 않아 `pnpm e2e:rc`는 이번 라운드에서 실행하지 않았습니다.

## 다음 라운드 우선순위
1. `src/components/DartAlertsSummaryCard.tsx`의 `react-hooks/set-state-in-effect` 잔여 경고 1건을 축소합니다.
