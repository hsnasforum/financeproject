# 2026-07-01 Planning workspace presenter split

## 대상 Issue
- GitHub Issue: https://github.com/hsnasforum/financeproject/issues/118
- 우선순위 항목: 5. Planning workspace controller/runtime presenter 분리

## 사용 skill
- planning-gate-selector: React hook, planning v2 UI/runtime 변경에 필요한 검증 범위 선정
- work-log-closeout: 변경 파일, 검증, 잔여 리스크 종료 기록 정리

## 변경 파일
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/workspacePresenters.ts`
- `src/components/planning/workspace/useWorkspaceRuntimeBundle.ts`
- `src/components/planning/workspace/workspaceRuntimeHelpers.ts`
- `src/lib/planning/v2/planningRunInputContract.ts`
- `src/lib/planning/core/v2/validate.ts`
- `src/lib/planning/server/runs/createRunCommandParser.ts`
- `tests/planning/ui/workspacePresenters.test.ts`
- `tests/planning/ui/workspaceRuntimeBundle.test.ts`
- `tests/planning-v2-api/create-run-service-modules.test.ts`

## 변경 요약
- workspace controller의 preflight 실행 가드, quick start next step, result/debug/tab VM 계산을 DOM 없는 `workspacePresenters.ts`로 분리했습니다.
- controller return shape는 유지하고, controller는 runtime/profile/execution 상태 조립과 패널 props 구성 중심으로 축소했습니다.
- client runtime parser와 server create-run parser가 공유하는 `PLANNING_RUN_INPUT_CONTRACT`를 추가했습니다.
- horizonMonths 검증은 core validate에서도 같은 contract 값을 쓰도록 맞췄습니다.
- presenter 단위 테스트와 client/server run input 경계 동기화 테스트를 추가했습니다.

## 검증 결과
- PASS: `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm vitest run tests/planning/ui/workspacePresenters.test.ts`
  - 1 file, 3 tests passed
- PASS: `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm vitest run tests/planning/ui/workspaceRuntimeBundle.test.ts`
  - 1 file, 5 tests passed
- PASS: `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm typecheck`
- PASS: `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm lint`
- PASS: `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm test`
  - 744 files, 2463 tests passed
- PASS: `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm planning:v2:engine:guard`
- PASS: `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm build`
  - Next.js production build completed, 251 static pages generated
- PASS: `git diff --check`

## 실패 후 재시도
- `pnpm` 직접 실행은 WSL 비로그인 PATH에서 `pnpm: command not found`로 실패했습니다. `/home/xpdlqj/.nvm/versions/node/v22.22.0/bin/pnpm` 절대 경로로 재실행해 통과했습니다.
- PowerShell에서 `&&` 또는 `| head`가 WSL 명령 밖에서 해석된 조회 명령이 실패했습니다. 파일 변경 영향은 없고, 명령을 분리해 재확인했습니다.

## 남은 리스크
- 브라우저 e2e 또는 시각 스크린샷은 실행하지 않았습니다. 이번 변경은 presenter/VM 계산과 hook 조립 중심이라 unit, typecheck, lint, full test, build로 확인했습니다.
- panel prop shape는 build/typecheck로 확인했지만 실제 클릭 흐름은 다음 UI 작업 라운드에서 e2e가 필요할 수 있습니다.
- legacy route/API 삭제 정책은 이번 범위가 아니며, telemetry/access log 확인 전 삭제하지 않았습니다.

## 다음 라운드 우선순위
- #119 Planning route auth user scope 방식 통일
