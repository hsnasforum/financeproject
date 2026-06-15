# 2026-05-30 DartCompanyPageClient React Compiler 경고 축소

## 요약
- `src/components/DartCompanyPageClient.tsx`의 즐겨찾기/최근 조회 목록 초기 hydrate를 `window.setTimeout(..., 0)` 콜백으로 옮겨 `react-hooks/set-state-in-effect` 경고 1건을 제거했습니다.
- 기업개황 fetch, `corpCode` 누락 안내, OpenDART 실패 안내, `fetchedAt/source` 표시, 모니터링 이동 링크와 API 계약은 변경하지 않았습니다.
- 전체 one-off scan은 `33 warnings / 27 files`에서 `32 warnings / 26 files`로 줄었고, 대상 파일은 잔여 목록에서 빠졌습니다.
- `/public/dart/company` 사용자 흐름은 DART 전용 e2e로 확인했습니다.

## 사용 skill
- `finance-skill-routing`: 이번 라운드에 필요한 Finance Project 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: DART 회사 상세 UI/hooks 변경에 맞춰 targeted ESLint, DART route/store 테스트, lint/test/build/e2e, guard를 검증 세트로 선택했습니다.
- `dart-data-source-hardening`: DART 기업개황 UI의 fetch 실패, empty/fallback, freshness/source 표시 계약이 유지되는지 확인했습니다.
- `work-log-closeout`: 변경 파일, 검증 결과, 잔여 리스크를 `/work` 종료 기록으로 남겼습니다.
- `route-ssot-check`, `planning-v3-batch-contract-narrowing`: route/href 또는 planning v3 batch-family 계약 변경이 없어 사용하지 않았습니다.

## 변경 파일
- `src/components/DartCompanyPageClient.tsx`
- `work/5/30/2026-05-30-dart-company-page-react-compiler.md`

## 검증
- `corepack pnpm exec eslint src/components/DartCompanyPageClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`: `messages: []`, `warningCount: 0`
- `corepack pnpm exec vitest run tests/dart-query-helpers.test.ts tests/dart-company-route.test.ts tests/dart-corpcodes-search.test.ts tests/dart-corpcodes-build-auth.test.ts`: PASS, 4 files / 11 tests
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-dart-company-page.json`: `32 warnings / 26 files`, target 없음
- `git diff --check`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm exec vitest run tests/dart-store.test.ts tests/dart-company-route.test.ts`: PASS, 2 files / 6 tests
- `corepack pnpm test`: 1차 FAIL, 직전 빌드 산출물 `.next-build-2820794/standalone/tests/e2e/...`가 Vitest 수집 범위에 섞여 helper import를 찾지 못함
- `.next-build-info.json` 제거 후 `corepack pnpm cleanup:next-artifacts`: PASS, `.next-build-2820794` 제거
- `corepack pnpm test`: PASS, 663 files / 2035 tests
- `corepack pnpm build`: PASS
- `find . -maxdepth 1 -type d -name '.next-build-*' -print`: 잔여 디렉터리 없음
- `corepack pnpm e2e:rc:dart`: PASS, 3 tests

## 남은 리스크
- 즐겨찾기/최근 조회 목록 hydrate가 다음 macrotask로 이동해 첫 paint 직후 아주 짧게 사이드 목록이 비어 보일 수 있습니다.
- DART 기업개황 API, fallback 문구, freshness/source 표시 분기는 변경하지 않았으므로 해당 런타임 품질은 기존 보장 범위와 같습니다.
- route, href, selector, 사용자 문구는 변경하지 않았습니다.

## 다음 라운드 우선순위
1. `src/components/DartDisclosureMonitorClient.tsx`의 `react-hooks/set-state-in-effect` 잔여 경고 1건을 축소합니다.
