# 2026-03-11 e2e parallel classification runner

## 변경 이유
- dev/prod 병렬 flake 분류를 하려면 같은 작은 spec 셋을 여러 번 돌려야 하는데, 수동 명령 나열만으로는 결과 비교와 종료 지점을 관리하기 어렵다.
- prod 반복 분류는 최신 `.next` 재사용이 가능한데도 매번 `pnpm build` 를 다시 타면 시간과 노이즈가 너무 커진다.

## 이번 변경
1. `package.json` 에 `e2e:parallel:flake:prod:raw` 를 추가해 prod 반복 실행 경로를 build와 분리했다.
2. `e2e:parallel:flake:prod` 는 여전히 `pnpm build` 를 포함하지만, 반복 분류는 `raw` 경로를 재사용할 수 있게 했다.
3. `scripts/e2e_parallel_flake_classify.mjs` 는 dev/prod 포트를 분리하고 `--runs`, `--skip-build`, `--stop-on-fail` 옵션과 요약 출력을 제공한다.

## 검증
1. `pnpm e2e:parallel:classify -- --runs=1 --skip-build --stop-on-fail`
2. `pnpm lint`
3. `pnpm test tests/planning/reports/runSelection.test.ts`
4. `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3114`

## 검증 결과
- `pnpm lint` PASS
- 초기 `pnpm e2e:parallel:classify -- --runs=1 --skip-build --stop-on-fail` 에서는 dev 1패스가 FAIL 했다.
- 같은 패스에서 `dart-flow`, `flow-planner-to-history` 가 다시 깨졌고, dev webpack runtime 오류와 `/planning/reports` 500 이 함께 관찰됐다.
- 이후 `PlanningWorkspaceClient`, `DartSearchClient` 를 보수적으로 조정한 뒤 `pnpm e2e:parallel:classify -- --runs=2 --mode=development --skip-build --dev-port-base=3114` 는 `2/2 PASS` 했다.
- 이어서 같은 상태로 `pnpm e2e:parallel:classify -- --runs=5 --mode=development --skip-build --dev-port-base=3114` 도 `5/5 PASS` 했다.
- 추가로 `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3116` 도 `3 passed (37.9s)` / `PASS development attempt=1/1` 로 통과했다.
- 같은 3116 검증에서 `Using tsconfig file: tsconfig.playwright.json` 이 확인됐고, 전후 `sha256sum tsconfig.json` 값도 동일해 root `tsconfig.json` churn 은 재발하지 않았다.
- 다만 3116 PASS 로그 안에서도 `__webpack_modules__[moduleId] is not a function` 직후 `/planning/reports 500`, 이어서 `/api/planning/v2/profiles` 의 `Unexpected end of JSON input` + 500 이 같은 런 안에 남았다.
- 이번 후속 패치에서는 Playwright 관리 dev 서버가 `tsconfig.playwright.json` 을 사용하도록 분리했고, root `tsconfig.json` 의 `.next-e2e-*` include 를 다시 비웠다.
- `/planning/reports` 와 prototype page 는 첫 server scope 로드가 실패해도 500 대신 client fallback 으로 다시 읽게 조정했다.
- 이후 `PlanningRunsClient`, `PlanningWorkspaceClient`, `DartSearchClient` 에 mount 해제 뒤 late `setState` 를 줄이기 위한 `isMountedRef` 가드를 추가했다.
- 같은 변경 뒤 `pnpm lint`, `pnpm build` 는 다시 PASS 했다.
- 같은 3116 명령을 연속 2회 재실행했을 때 첫 시도는 `flow-planner-to-history` 가 `/planning/runs` 500 으로 FAIL 했고, 바로 다음 재실행은 `3 passed (41.3s)` / `PASS development attempt=1/1` 로 통과했다.
- 최신 `.next-e2e` 로그에는 `Can't perform a React state update on a component that hasn't mounted yet` 경고가 여전히 1회 남아 있어, mounted guard는 일부 완화였지만 root warning 제거까지는 끝내지 못했다.
- 수정 직후 첫 `pnpm e2e:parallel:classify -- --runs=1 --mode=development --skip-build --dev-port-base=3114` 는 `next.config.ts` 변경 감지 재시작 때문에 `ERR_EMPTY_RESPONSE` 로 실패했지만, 같은 명령 재실행은 PASS 했다.
- `pnpm test tests/planning/reports/runSelection.test.ts` PASS
- 기본 `.next` 기준 `pnpm build` 는 고아 build 프로세스를 정리한 clean 상태에서 다시 실행했을 때 webpack compile, TypeScript, static page generation, trace 수집까지 끝까지 PASS 했다.
- 따라서 이번 턴에 보인 `.next/lock` 과 `SIGTERM(143)` 는 앱 회귀보다 잔류 build 프로세스/세션 종료가 섞인 환경 이슈로 분리하는 편이 맞다.

## 남은 리스크
- 최신 dev classify PASS 로그 안에서도 `__webpack_modules__[moduleId] is not a function` 와 `/planning/reports` 500 이 여러 번 보였고, spec은 이후 복구돼 통과했다.
- 3116 새 포트에서도 같은 패턴이 반복돼, 남은 문제는 특정 포트 churn 보다 shared `next dev --webpack` runtime noise 쪽으로 더 수렴했다.
- 즉 개별 spec 회귀는 줄었지만 shared `next dev --webpack` runtime 노이즈가 완전히 사라졌다고 보기는 어렵다.
- 기본 `.next` build 자체는 clean 상태에서 PASS 했으므로, 남은 리스크는 build가 아니라 shared `next dev --webpack` runtime 노이즈 쪽에 더 가깝다.
- late `setState` 브라우저 경고도 최신 PASS 로그에 1회 남아 있어, 현재는 mounted guard로 위험한 경로를 줄였지만 경고 source 자체는 추가 축약이 필요하다.

## 다음 작업
1. PASS 로그에 남은 webpack runtime 오류와 route abort/500 을 시간축 기준으로 다시 맞춘다.
2. 필요하면 `/planning/reports` 남은 초기 연산을 더 지연하거나 dev prewarm 경로를 검토한다.
3. late `setState` 브라우저 경고의 남은 source 를 action patch/run polling 기준으로 다시 좁힌다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
