# 2026-05-26 DART 검색 React Compiler lint 축소

## 변경 파일
- `src/components/DartSearchClient.tsx`
- `work/5/26/2026-05-26-dart-search-react-compiler.md`

## 사용 skill
- `planning-gate-selector`: React hooks, DART 사용자 경로, App Router page 영향 범위에 맞춰 변경 파일 lint, DART 단위 테스트, 전체 lint, build, `e2e:rc:dart`를 선택했습니다.
- `dart-data-source-hardening`: DART 검색 UI가 URL query, sessionStorage, localStorage, missing-index 안내를 다루므로 데이터 없음·복구·fallback 흐름이 조용히 무너지지 않는지 점검했습니다.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 잔여 React Compiler migration 리스크를 `/work` 표준 형식으로 정리했습니다.

## 변경 이유
- 직전 라운드 기준 전체 `react-hooks/set-state-in-effect` 잔여 105건 중 `DartSearchClient` 7건이 가장 큰 단일 군집이었습니다.
- DART 검색 화면은 `/public/dart`에서 검색, 상세 복귀, 모니터링 탭, 최근 검색/즐겨찾기 복구를 담당하므로 lint 제거와 사용자 흐름 보존을 함께 확인해야 했습니다.
- effect에서 hydration, URL tab, localStorage 목록, reload/sessionStorage 검색 복구를 즉시 `setState`로 밀어 넣던 구조를 줄여 React Compiler 호환성을 높였습니다.

## 핵심 변경
- hydration readiness는 `useSyncExternalStore` snapshot으로 바꿔 mount 직후 `setState` effect를 제거했습니다.
- URL tab은 `urlTab`과 사용자 선택 override의 파생값으로 계산해 URL 동기화 effect를 없앴습니다.
- 즐겨찾기, 최근 조회, 최근 검색어는 localStorage external snapshot과 명시 refresh tick에서 읽도록 바꿔 초기 local list sync effect를 제거했습니다.
- URL query, pending query, reload snapshot 복구는 취소 가능한 timer로 예약해 StrictMode 첫 pass cleanup과 React Compiler lint를 동시에 만족하도록 했습니다.
- 변경 파일 기준 `react-hooks/set-state-in-effect` 7건을 0건으로 줄였고, 전체 잔여 수는 105건에서 98건으로 줄었습니다.

## 검증
- `corepack pnpm exec eslint src/components/DartSearchClient.tsx --rule "react-hooks/set-state-in-effect:error"` PASS: `DartSearchClient` 기준 `react-hooks/set-state-in-effect` 0건
- `corepack pnpm test tests/dart-search-client.test.tsx tests/dart-store.test.ts tests/dart-query-helpers.test.ts` PASS: 3 files / 8 tests
- `corepack pnpm lint` PASS
- `corepack pnpm build` PASS
- `corepack pnpm e2e:rc:dart` PASS: 3 tests
- `corepack pnpm exec eslint src tests scripts planning middleware.ts next.config.ts playwright.config.ts postcss.config.mjs prisma.config.ts vitest.config.ts eslint.config.mjs --rule "react-hooks/set-state-in-effect:error" -f json > tmp/eslint-react-hooks-set-state-after-dart.json || true` INFO: JSON report 생성
- `rg -o react-hooks/set-state-in-effect tmp/eslint-react-hooks-set-state-after-dart.json | wc -l` INFO: 전체 잔여 98건

## 남은 리스크
- `react-hooks/set-state-in-effect`는 아직 98건 남아 있으며, 다음 배치에서는 기존 상위 군집인 `ProductListPage` 6건을 우선 확인하는 편이 효율적입니다.
- 이번 변경은 `/public/dart` 검색 클라이언트의 상태 소유권 정리에 한정했고, `DartDisclosureMonitorClient`와 회사 상세 클라이언트는 직접 수정하지 않았습니다.
- 로컬 e2e는 dev runtime 기준으로 확인했습니다. production DART 조합은 이전 report-flake production e2e에서 통과했지만 이번 커밋 후 별도로 재실행하지 않았습니다.
- 새 커밋을 push하면 PR #24 head SHA가 바뀌므로 GitHub Actions `CI`, `E2E Smoke`를 새 SHA 기준으로 다시 확인해야 합니다.
- PR #24 병합은 원격 `main` 변경이므로 명시 승인 전에는 진행하지 않습니다.

## 다음 라운드
- `ProductListPage`의 URL query 초기화와 provider fallback 상태를 파생값 또는 초기화 계약으로 분리해 `react-hooks/set-state-in-effect` 6건을 줄입니다.
- 그다음 `PlanningRunsClient` 등 4건대 군집을 순차적으로 줄입니다.
- 각 배치마다 변경 파일 기준 lint 0건, 관련 단위 테스트 또는 e2e, `pnpm build`를 확인합니다.
