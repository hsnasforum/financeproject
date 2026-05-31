# 2026-05-30 PlanningTrashClient React Compiler 경고 축소

## 변경 파일
- `src/components/PlanningTrashClient.tsx`
- `vitest.config.ts`
- `work/5/30/2026-05-30-planning-trash-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 이번 라운드의 기본 구현 skill 조합과 조건부 skill 필요 여부를 확인했습니다.
- `planning-gate-selector`: React 훅 변경, `/planning/trash` 화면, test config 영향에 맞는 검증 범위를 정했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `PlanningTrashClient`가 mount 직후 `loadTrashEvent("all")`을 effect 본문에서 바로 호출하고, 실제 조회 함수가 첫 `await` 전에 loading/error state를 갱신해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- `pnpm build` 후 남아 있던 `.next-build-<pid>` standalone 산출물을 `pnpm test`가 수집해 복사본 e2e spec import 실패가 발생했습니다.

## 핵심 변경
- 최초 휴지통 조회를 `window.setTimeout(..., 0)`으로 다음 macrotask에 예약했습니다.
- 컴포넌트 unmount 시 예약된 최초 조회를 `window.clearTimeout`으로 정리하도록 했습니다.
- `vitest.config.ts`의 제외 패턴을 `.next-build/**`에서 `.next-build*/**`로 넓혀 suffixed isolated build 산출물이 테스트 대상에 섞이지 않도록 했습니다.
- `/planning/trash` 경로, `/api/planning/v2/trash*` API path, 필터/복구/영구 삭제/비우기 payload 계약, 사용자 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/PlanningTrashClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `react-hooks/set-state-in-effect` 1건. `loadTrashEvent("all")` 초기 effect 호출 지점.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-planning-trash-client.json`
  - PASS. 전체 잔여 경고: 13건 / 10개 파일.
  - 이번 대상 파일 `src/components/PlanningTrashClient.tsx` 경고 없음.
- `corepack pnpm exec vitest run tests/planning-v2-api/trash-route.test.ts tests/planning-store.test.ts tests/planning-reports/storage.test.ts`
  - PASS. 3개 파일 / 17개 테스트 통과.
- `pnpm lint`
  - PASS. `vitest.config.ts` 제외 패턴 변경 후 재실행 기준 통과.
- `git diff --check`
  - PASS. Windows 쪽 첫 호출은 시간 제한으로 종료되어 WSL git로 재확인했습니다.
- `pnpm test`
  - 1차: FAIL. `.next-build-1130212/standalone/tests/e2e/flow-v3-import-to-cashflow.spec.ts`와 `.next-build-1130212/standalone/tmp/flow-v3-import-to-cashflow-audit.spec.ts`가 수집되어 helper import 실패.
  - `pnpm cleanup:next-artifacts`: PASS. stale `.next-build-1130212` 제거.
  - `vitest.config.ts` 제외 패턴 수정 후 재실행: PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - 1차: 시간 제한으로 결과 미확인.
  - 재실행: PASS. Next.js production build 및 `/planning/trash`, `/api/planning/v2/trash`, `/api/planning/v2/trash/empty`, `/api/planning/v2/trash/restore` 경로 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- `/planning/trash` 첫 진입 시 휴지통 조회 시작이 기존보다 한 macrotask 늦게 예약됩니다.
- 실제 복구/영구 삭제/비우기 성공 여부는 dev unlock/CSRF 쿠키와 planning trash 저장소 상태에 의존합니다.
- route, href, selector, 사용자 문구를 바꾸지 않아 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
- 다음 React Compiler 경고 축소 후보는 `src/components/PublicApisDiagnosticsClient.tsx`입니다.
