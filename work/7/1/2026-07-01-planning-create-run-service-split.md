# 2026-07-01 Planning create run service orchestration 절단

## 변경 파일
- `src/lib/planning/server/runs/createRunService.ts`
- `src/lib/planning/server/runs/createRunCommandParser.ts`
- `src/lib/planning/server/runs/createRunPreflight.ts`
- `src/lib/planning/server/runs/createRunStagePlan.ts`
- `src/lib/planning/server/runs/createRunRecordAssembler.ts`
- `tests/planning-v2-api/create-run-service-boundary.test.ts`
- `tests/planning-v2-api/create-run-service-modules.test.ts`

## 사용 skill
- planning-gate-selector: Planning v2 create-run 서비스 변경에 맞는 typecheck, engine guard, planning v2, release, build 검증 범위 선정
- work-log-closeout: 변경 파일, 실제 실행 명령, 잔여 리스크 기록

## 변경 이유
- GitHub Issue: https://github.com/hsnasforum/financeproject/issues/117
- `createRunService.ts`가 request command parsing, preflight, stage pipeline descriptor, persistence record assembly까지 한 파일에서 함께 처리해 작은 옵션 변경도 전체 create-run 회귀 범위로 번졌습니다.
- route adapter와 `/api/planning/v2/runs` POST response shape는 유지하면서 parser, preflight, stage plan, record assembler를 독립 테스트 가능한 함수 모듈로 분리했습니다.

## 핵심 변경
- `parseCreatePlanningRunCommand`와 scenario/debt input normalization을 `createRunCommandParser.ts`로 이동했습니다.
- preflight 실행과 block issue 응답 조립을 `evaluateCreatePlanningRunPreflight`로 분리했습니다.
- stage pipeline descriptor 생성을 `buildPlanningStagePlan`로 분리하고 stage output 해석 함수를 추가했습니다.
- artifact/resultDto/reproducibility/createRun payload 조립을 `assemblePlanningRunRecordInput`로 분리했습니다.
- `createPlanningRun` 본문은 feature flag, profile/scenario 준비, assumptions resolve, pipeline 실행, 저장, metrics/audit 중심의 orchestration만 남도록 줄였습니다.
- parser, preflight, stage plan, persistence assembler를 route/repository 없이 검증하는 단위 테스트를 추가했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/create-run-service-modules.test.ts` PASS: 2 files, 6 tests
- `corepack pnpm typecheck:planning` PASS
- `corepack pnpm planning:v2:engine:guard` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm test tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/create-run-service-modules.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-v2-api/run-blob-route.test.ts tests/planning-v2-api/run-action-progress-route.test.ts tests/planning-v2-api/run-action-center-ssot.test.ts` PASS: 6 files, 28 tests
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:regress` PASS
- `corepack pnpm test` PASS: 743 files, 2459 tests
- `corepack pnpm release:verify` PASS
- `corepack pnpm build` PASS
- `git diff --check -- src/lib/planning/server/runs/createRunService.ts src/lib/planning/server/runs/createRunCommandParser.ts src/lib/planning/server/runs/createRunPreflight.ts src/lib/planning/server/runs/createRunStagePlan.ts src/lib/planning/server/runs/createRunRecordAssembler.ts tests/planning-v2-api/create-run-service-boundary.test.ts tests/planning-v2-api/create-run-service-modules.test.ts` PASS

## 남은 리스크
- 계산 엔진, ResultDto schema, 새 stage 추가는 이번 범위에서 변경하지 않았습니다.
- `planning:v2:complete`의 freeze guard는 working tree의 v2 core 변경을 감지해 `planning:v2:complete`, `planning:v2:regress` 필요를 WARN으로 안내했습니다. 두 게이트는 모두 실행해 PASS를 확인했습니다.
- 일부 테스트 stderr의 metrics/audit/fallback/schema mismatch 로그는 실패 주입 또는 fallback 경로를 검증하는 기존 테스트 출력입니다.
- 1차 `corepack pnpm typecheck:planning`은 새 모듈 타입 경계 오류로 실패했고, `AssumptionsV2` import 위치와 normalization/health/simulation assumptions 타입을 보정한 뒤 PASS를 확인했습니다.
- preflight 단위 테스트 1차 실패는 실제 메시지 계약과 기대 문자열 차이였고, route 테스트의 구체 문구와 맞는 `expected ids` 기준으로 수정한 뒤 PASS를 확인했습니다.
- `release:verify` 1차 실행 시 shell quoting 오류로 명령이 시작되지 않았습니다. PowerShell 단일 인자 방식으로 재실행해 PASS를 확인했습니다.
- 다음 우선순위는 Issue #118 Planning workspace controller/runtime presenter 분리입니다.
