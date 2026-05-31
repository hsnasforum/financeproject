# 2026-05-30 OpsHubClient React Compiler 경고 축소

## 변경 파일
- `src/components/OpsHubClient.tsx`
- `work/5/30/2026-05-30-ops-hub-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 구현 라운드의 기본 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 컴포넌트와 `/ops` 허브 변경에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 실제 실행한 명령과 남은 리스크를 `/work` 형식에 맞춰 기록했습니다.

## 변경 이유
- `OpsHubClient`가 mount 직후 `loadRestorePoint()`, `loadPolicy()`, `loadRecentErrors()`를 effect 본문에서 바로 호출하고, 각 로더가 첫 `await` 전에 loading/error state를 갱신해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `/ops` 허브의 restore point, retention policy, recent errors 자동 조회와 수동 새로고침/재시도 흐름은 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 핵심 변경
- 최초 restore point, retention policy, recent errors 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 넘겼습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- 상단 `새로고침` 버튼과 각 카드의 `다시 시도` 동작은 변경하지 않았습니다.
- `/ops` 링크 목록, route, href, API path, DOM 문구, 데이터 payload 계약은 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/OpsHubClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건. `loadRestorePoint()` 초기 effect 호출 지점.
  - 변경 후 PASS. `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-ops-hub-client.json`
  - PASS. 전체 잔여 경고: 17건 / 14개 파일.
  - 이번 대상 파일 `src/components/OpsHubClient.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/retention-policy.test.ts tests/cleanup.test.ts tests/audit-log-store.test.ts tests/middleware-security.test.ts tests/ops-error-contract.test.ts`
  - PASS. 5개 파일 / 26개 테스트 통과.
- `pnpm lint`
  - PASS.
- `git diff --check`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/ops`, `/api/dev/backup/restore-point`, `/api/dev/maintenance/retention`, `/api/dev/errors/recent` 포함 확인.
- `pnpm cleanup:next-artifacts`
  - PASS. active runtime 보호로 root build artifact `.next-build`, `.next-build-info.json` 정리는 skip됨.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' \) -print`
  - 출력 없음. numbered 임시 Next 산출물 누수 없음.

## 남은 리스크
- `/ops` 첫 진입 시 restore point, retention policy, recent errors 조회 시작이 기존보다 한 macrotask 늦게 예약됩니다.
- 실제 API 성공 여부는 dev/local guard, CSRF 쿠키, 로컬 설정 파일, 오류 ring-buffer 상태에 의존합니다.
- route, href, selector, 사용자 흐름, 사용자 문구를 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/OpsPlanningCacheClient.tsx`입니다.
