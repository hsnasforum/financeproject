# 2026-03-11 e2e dev hmr guard

## 수정 대상 파일
- `tests/e2e/helpers/e2eTest.ts`
- `tests/e2e/dart-build-index.spec.ts`
- `tests/e2e/dart-flow.spec.ts`
- `tests/e2e/dart-missing-index.spec.ts`
- `tests/e2e/debug-access.spec.ts`
- `tests/e2e/flow-history-to-report.spec.ts`
- `tests/e2e/flow-planner-to-history.spec.ts`
- `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- `tests/e2e/planning-v2-fast.spec.ts`
- `tests/e2e/planning-v2-full.spec.ts`
- `tests/e2e/smoke.spec.ts`
- `tests/e2e/v3-draft-apply.spec.ts`

## 변경 이유
- 남은 dev classify 리스크는 앱 로직보다 Playwright 브라우저가 `/_next/webpack-hmr`에 붙으면서 생기는 `Fast Refresh had to perform a full reload` 축으로 좁혀졌다.
- 같은 축에서 과거 `__webpack_modules__[moduleId] is not a function`, `/planning/runs 500`, `/planning/reports 500`가 PASS 로그 안에 섞여 나왔다.

## 무엇이 바뀌었는지
- `tests/e2e/helpers/e2eTest.ts`를 추가해 dev e2e에서만 `/_next/webpack-hmr` websocket을 가짜 open socket으로 치환하도록 했다.
- 기존 spec import는 `@playwright/test` 대신 위 helper를 보도록 바꿨다.
- 이 guard는 Playwright dev 실행에만 적용되고 production 실행이나 실제 앱 데이터 요청은 건드리지 않는다.

## 검증 명령
- `pnpm exec eslint tests/e2e/helpers/e2eTest.ts tests/e2e/dart-build-index.spec.ts tests/e2e/v3-draft-apply.spec.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts tests/e2e/flow-planner-to-history.spec.ts tests/e2e/planning-v2-full.spec.ts tests/e2e/debug-access.spec.ts tests/e2e/dart-flow.spec.ts tests/e2e/smoke.spec.ts tests/e2e/planning-v2-fast.spec.ts tests/e2e/dart-missing-index.spec.ts tests/e2e/flow-history-to-report.spec.ts`
- `pnpm e2e:pw tests/e2e/flow-planner-to-history.spec.ts --workers=1 --repeat-each=5`
- `pnpm e2e:parallel:classify -- --runs=3 --mode=development --skip-build --dev-port-base=3316`
- `pnpm build`

## 결과
- eslint PASS
- `flow-planner-to-history` 반복 5회 PASS
- dev classify `pass=3/3`
- 최신 classify 기준 `Fast Refresh had to perform a full reload`, `__webpack_modules__[moduleId] is not a function`, `/planning/runs 500`, `/planning/reports 500` 재현 없음
- `pnpm build` PASS

## 남은 리스크
- 이번 라운드의 dev classify 안정성 리스크는 재현되지 않았다.
- [가정] 실제 수동 개발 브라우저 세션의 HMR 동작은 그대로이며, 이번 수정은 Playwright dev e2e 안정화 범위에 한정된다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
