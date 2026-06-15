# 2026-05-25 planning v2 gate 안정화

## 변경 파일
- `scripts/datago_sync.mjs`
- `scripts/planning_v2_regression.mjs`
- `scripts/planning_v2_static_guard.mjs`
- `src/components/planning/workspace/usePlanningWorkspaceController.tsx`
- `src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts`
- `src/components/planning/workspace/useWorkspaceProfileBundle.ts`
- `tests/next-artifact-prune.test.ts`
- `tests/planning-v2/reportInterpretationAdapter.test.ts`

## 사용 skill
- `dart-data-source-hardening`: 공공데이터 KDB endpoint 전환의 env, 실패 모드, 사용자 노출 영향 확인
- `planning-gate-selector`: scripts, typecheck, planning v2 regression/e2e, build 검증 범위 선정
- `route-ssot-check`: route root 스캔 로직 변경이 실제 route/document 계약을 바꾸지 않는지 확인
- `work-log-closeout`: 변경 범위와 검증 결과 기록

## 변경 이유
- `datago_sync`의 KDB 공공데이터 endpoint를 `https`로 바꿔 upstream 호출 기본값을 더 안전하게 했습니다.
- `planning:v2:regress`가 실행일에 따라 assumptions freshness 경고가 흔들리지 않도록 기본 기준시각을 고정하고, `PLANNING_V2_REGRESSION_NOW_ISO`로 재정의할 수 있게 했습니다.
- `planning:v2:guard`의 top-level route root 수집에서 실제 `page`/`route` surface가 없는 폴더를 제외해 문서 route inventory 오탐을 줄였습니다.
- 검증 중 `planning:v2:regress` full e2e에서 고급 모드 localStorage 로딩 전 초보자 목표 보정 effect가 초기 입력을 덮는 race를 발견해, `beginnerModeLoaded` 이후에만 해당 effect가 실행되도록 막았습니다.
- 테스트의 implicit `any`와 union 접근을 좁혀 typecheck gate와 일치시켰습니다.

## 데이터 소스 점검
- 의존 데이터 소스: 공공데이터 KDB `GetDepositProductInfoService`.
- env 이름 변경 없음: 기존 `KDB_DATAGO_SERVICE_KEY` 또는 `DATAGO_SERVICE_KEY`를 그대로 사용합니다.
- 실패 모드 변경 없음: env 누락은 기존 오류, upstream 실패는 기존 `upstream failed` 오류 경로를 유지합니다.
- 사용자 문구 영향 없음: 동기화 스크립트 endpoint만 바뀌었고 UI copy나 freshness 표시는 변경하지 않았습니다.

## Route SSOT 확인
- 실제 경로: public page route는 추가/삭제하지 않았습니다.
- 문서 기준과의 차이: `docs/current-screens.md` 갱신 불필요.
- 필요한 수정: 없음.
- 실행한 가드: `planning:v2:guard`, `planning:ssot:check`, `build` 통과.
- 남은 리스크: route root 스캔은 현재 `page`/`route` 파일 존재 여부 기준입니다. route group/동적 segment 제외 규칙은 기존 `normalizeRouteRoot` 계약을 유지합니다.

## 검증
- `git diff --check -- .gitignore scripts/datago_sync.mjs scripts/planning_v2_regression.mjs scripts/planning_v2_static_guard.mjs tests/next-artifact-prune.test.ts tests/planning-v2/reportInterpretationAdapter.test.ts` PASS
- `node --check scripts/datago_sync.mjs`, `node --check scripts/planning_v2_regression.mjs`, `node --check scripts/planning_v2_static_guard.mjs` PASS
- `corepack pnpm exec eslint src/components/planning/workspace/useWorkspaceExecutionOptionsBundle.ts src/components/planning/workspace/useWorkspaceProfileBundle.ts src/components/planning/workspace/usePlanningWorkspaceController.tsx scripts/datago_sync.mjs scripts/planning_v2_regression.mjs scripts/planning_v2_static_guard.mjs tests/next-artifact-prune.test.ts tests/planning-v2/reportInterpretationAdapter.test.ts` PASS
- `corepack pnpm test tests/planning/ui/workspaceProfileBundle.test.ts tests/planning/ui/workspaceRuntimeBundle.test.ts tests/next-artifact-prune.test.ts tests/planning-v2/reportInterpretationAdapter.test.ts tests/planning-v2/golden-run-fixtures.test.ts tests/datago-servicekey.test.ts` PASS, 6 files / 19 tests
- `corepack pnpm exec tsc --noEmit` PASS
- `corepack pnpm planning:v2:guard` PASS
- `corepack pnpm exec playwright test tests/e2e/planning-v2-fast.spec.ts --grep 'keeps unsaved profile edits' --workers=1 --reporter=line` PASS
- `corepack pnpm planning:v2:regress` PASS, regression 9 cases + full e2e 8 tests
- `corepack pnpm planning:ssot:check` PASS, current-screens 5 files / 9 tests
- `corepack pnpm build` PASS

## 특이 사항
- 첫 `planning:v2:regress` 재실행은 PATH 인용 문제로 `corepack`을 찾지 못해 실행 전 실패했습니다.
- 다음 `planning:v2:regress`는 regression 9건은 PASS했지만 full e2e 1건이 실패했고, 원인 race를 수정한 뒤 focused e2e와 전체 regression/e2e를 모두 재실행해 PASS를 확인했습니다.

## 남은 리스크
- 실제 KDB upstream 네트워크 호출은 비밀키와 외부 상태가 필요해 실행하지 않았습니다.
- `.gitignore`, guidedoc ADS 삭제, Recommend/Recovery/QuickStartGate 변경은 이번 커밋 범위에 포함하지 않았습니다.
