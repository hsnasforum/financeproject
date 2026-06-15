# 2026-05-30 RulesOpsClient React Compiler 경고 축소

## 변경 파일
- `src/components/RulesOpsClient.tsx`
- `work/5/30/2026-05-30-rules-ops-client-react-compiler.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work` 기록의 다음 우선순위와 이번 라운드의 기본 skill 조합을 확인했습니다.
- `planning-gate-selector`: React hook 변경과 `/ops/rules` 화면 영향에 맞는 검증 범위를 정했습니다.
- `dart-data-source-hardening`: DART Rules Ops 화면이므로 env, API contract, freshness, fallback 흐름을 바꾸지 않는지 확인했습니다.
- `work-log-closeout`: 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 기록했습니다.

## 변경 이유
- `RulesOpsClient`가 mount 직후 `sessionStorage`에서 Dev unlock 상태를 읽고 effect 본문에서 `setUnlock(...)`을 즉시 호출해 `react-hooks/set-state-in-effect` 경고 1건을 만들었습니다.
- DART rules 실행 화면의 unlock/CSRF 복원 동작은 유지하면서 React Compiler 경고만 줄이는 것이 목표였습니다.

## 적용 변경
- `sessionStorage`의 `dev_action_unlocked_v1`, `dev_action_csrf_v1` 복원 로직을 `window.setTimeout(..., 0)` 안으로 옮겼습니다.
- unmount 시 예약된 unlock 복원을 취소하도록 `window.clearTimeout` cleanup을 추가했습니다.
- route, href, selector, API contract, env 이름, DART freshness, fallback, 사용자 노출 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/RulesOpsClient.tsx --rule react-hooks/set-state-in-effect:warn -f json`
  - 변경 전: `setUnlock((prev) => ({ ...prev, unlocked: true, csrf }))` 위치에서 경고 1건 확인.
  - 변경 후: PASS. `warningCount: 0`.
- `corepack pnpm exec vitest run tests/rules-ops-auth.test.ts tests/github-dispatch-auth.test.ts tests/dev-unlock-shortcut.test.ts`
  - PASS. 3개 파일 / 12개 테스트 통과.
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-rules-ops-client.json`
  - PASS. 전체 잔여 경고: 9건 / 6개 파일.
  - 이번 대상 파일 `src/components/RulesOpsClient.tsx` 경고 없음.
- `git diff --check`
  - PASS.
- `pnpm lint`
  - PASS.
- `pnpm test`
  - PASS. 663개 파일 / 2035개 테스트 통과.
- `pnpm build`
  - PASS. Next.js production build 및 `/ops/rules`, `/api/dev/dart/rules/run`, GitHub dispatch/checks dev routes 포함 확인.
- `find . -maxdepth 1 -type d \( -name '.next-build-*' -o -name '.next-e2e-*' -o -name '.next-build' \) -print`
  - 출력 없음. 잔여 isolated build/e2e 산출물 없음.

## 남은 리스크
- Dev unlock 복원은 기존 effect 직후 동기 실행에서 다음 macrotask 실행으로 바뀝니다. 사용자가 보는 차이는 잠금 해제 상태 복원이 아주 짧게 늦어지는 정도입니다.
- DART rules 실행 API, workflow dispatch, PR checks polling, env 이름, freshness/fallback 정책은 바꾸지 않았습니다.

## 다음 라운드 우선순위
- `src/components/forms/NumberField.tsx`의 `react-hooks/set-state-in-effect` 경고를 기준선으로 확인합니다.
- 공용 입력 컴포넌트 변경이면 관련 form/number input 테스트와 `pnpm lint`, `pnpm test`, `pnpm build`를 최소 검증 후보로 검토합니다.
