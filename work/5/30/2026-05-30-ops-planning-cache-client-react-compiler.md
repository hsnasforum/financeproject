# 2026-05-30 OpsPlanningCacheClient React Compiler 경고 축소

## 변경 파일
- `src/components/OpsPlanningCacheClient.tsx`
- `work/5/30/2026-05-30-ops-planning-cache-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트와 `/ops/planning-cache` 화면 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `OpsPlanningCacheClient`가 mount 직후 `loadStats()`를 effect 본문에서 바로 호출하고, `loadStats`가 첫 `await` 전에 loading/error/stats state를 갱신해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/ops/planning-cache`의 자동 통계 조회, 수동 새로고침, 만료 캐시 정리 흐름은 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 planning-cache 통계 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 수동 `새로고침`과 `만료 캐시 정리` 버튼 동작은 변경하지 않았습니다.
- `/ops/planning-cache` 경로, `/ops` 링크, stats/purge API path, 사용자 문구, 데이터 payload 계약은 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/OpsPlanningCacheClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건. `loadStats()` 초기 effect 호출 지점.
  - 변경 후 PASS. `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-planning-cache-client.json`
  - PASS. 전체 잔여 경고: 16건 / 13개 파일.
  - 이번 대상 파일 `src/components/OpsPlanningCacheClient.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/planning-cache/storage.test.ts tests/planning-v2-api/simulate-route.test.ts tests/ops-page-access.test.ts tests/ops-error-contract.test.ts`
  - PASS. 4개 파일 / 20개 테스트 통과.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/ops/planning-cache`, `/api/ops/planning-cache/stats`, `/api/ops/planning-cache/purge` 포함 확인.
- `pnpm cleanup:next-artifacts`
  - PASS. root build artifact `.next-build` 정리 완료.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 임시 Next 산출물 누수 없음.

## 남은 리스크
- `/ops/planning-cache` 첫 진입 시 stats 조회 시작이 기존보다 한 macrotask 늦게 예약됩니다.
- 실제 stats/purge 성공 여부는 dev unlock/CSRF 쿠키와 planning-cache 저장소 상태에 의존합니다.
- route, href, selector, 사용자 흐름, 사용자 문구를 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/OpsRunsClient.tsx`입니다.
