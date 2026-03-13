# 2026-03-11 dev runtime dart/planning link stabilization

## 수정 대상 파일
- `src/components/DartSearchClient.tsx`
- `src/components/PlanningWorkspaceClient.tsx`

## 변경 이유
- 병렬 dev classify에서 `/public/dart`가 full reload 뒤 idle 상태로 돌아가 `dart-search-item`이 사라지는 flake가 반복됐다.
- 같은 classify에서 `/planning`의 `planning-runs-link`가 ready 이후에도 클릭 직후 `/planning/runs`로 전환되지 않는 경우가 있었다.

## 무엇이 바뀌었는지
- DART 검색 화면은 dev reload 시점에 `draft query`, `pending search`, `last successful snapshot`을 `useLayoutEffect`로 더 이른 타이밍에 복구하도록 보강했다.
- DART 검색 성공 결과는 짧은 세션 스냅샷으로 저장해 full reload 뒤에도 결과 목록을 즉시 다시 그릴 수 있게 했다.
- 플래닝 워크스페이스의 `planning-runs-link`는 readiness를 프로필 로딩 완료에 묶지 않도록 줄였고, left click 시 `window.location.assign()`으로 `/planning/runs` 전환을 강제했다.
- 워크스페이스 상단 runs/reports 링크에는 `prefetch={false}`를 넣어 dev fan-out를 줄였다.

## 검증 명령
- `pnpm exec eslint src/components/DartSearchClient.tsx src/components/PlanningWorkspaceClient.tsx`
- `pnpm sec:check`
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts tests/e2e/flow-planner-to-history.spec.ts --workers=1`
- `pnpm e2e:pw tests/e2e/flow-planner-to-history.spec.ts --workers=1`
- `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3256`

## 결과
- eslint PASS
- `sec:check` PASS
- 대상 Playwright PASS
- 병렬 dev classify `pass=1/1`

## 남은 리스크
- 최종 PASS 런에도 dev 로그 안에는 `Fast Refresh had to perform a full reload`, `/planning/reports 500`, `__webpack_modules__[moduleId] is not a function` 흔적이 남았다.
- 이번 라운드는 flaky failure를 닫는 최소 수정에 집중했기 때문에, 위 webpack runtime noise 자체를 제거하는 작업은 다음 라운드로 남긴다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
