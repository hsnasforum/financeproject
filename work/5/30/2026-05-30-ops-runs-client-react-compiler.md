# 2026-05-30 OpsRunsClient React Compiler 경고 축소

## 변경 파일
- `src/components/OpsRunsClient.tsx`
- `work/5/30/2026-05-30-ops-runs-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트와 `/ops/runs` 화면 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `OpsRunsClient`가 mount 직후 `loadRuns()`를 effect 본문에서 바로 호출하고, `loadRuns`가 첫 `await` 전에 loading/error state를 갱신해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/ops/runs`의 자동 실행 기록 조회, 수동 조회, 개별 삭제, 보존 정리 흐름은 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 runs 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 수동 `조회`, 삭제 확인/진행, dry-run, cleanup 적용 동작은 변경하지 않았습니다.
- `/ops/runs` 경로, `/ops`와 `/ops/planning-cleanup` 링크, runs API path, 사용자 문구, 데이터 payload 계약은 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/OpsRunsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건. `loadRuns()` 초기 effect 호출 지점.
  - 변경 후 PASS. `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-runs-client.json`
  - PASS. 전체 잔여 경고: 15건 / 12개 파일.
  - 이번 대상 파일 `src/components/OpsRunsClient.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/planning/ops/runsRetention.test.ts tests/planning-security-csrf.test.ts tests/ops-page-access.test.ts tests/ops-error-contract.test.ts`
  - PASS. 4개 파일 / 16개 테스트 통과.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/ops/runs`, `/api/ops/runs`, `/api/ops/runs/[runId]`, `/api/ops/runs/cleanup` 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 임시 Next 산출물 누수 없음.

## 남은 리스크
- `/ops/runs` 첫 진입 시 runs 조회 시작이 기존보다 한 macrotask 늦게 예약됩니다.
- 실제 조회, 삭제, cleanup 성공 여부는 dev unlock/CSRF 쿠키와 planning run 저장소 상태에 의존합니다.
- route, href, selector, 사용자 흐름, 사용자 문구를 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/OpsSecurityClient.tsx`입니다.
