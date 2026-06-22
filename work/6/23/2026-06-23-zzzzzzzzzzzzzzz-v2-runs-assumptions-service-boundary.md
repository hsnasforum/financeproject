# 2026-06-23 v2 runs assumptions service boundary

## 변경 파일
- `src/app/api/planning/v2/runs/route.ts`
- `src/lib/planning/server/v2/runAssumptionsRouteService.ts`
- `tests/planning-v2/runAssumptionsRouteService.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzz-v2-runs-assumptions-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`의 다음 우선순위인 v2 runs assumptions storage 경계를 이번 라운드로 선택.
- `planning-gate-selector`: Planning v2 core route, API route, auth/user-scope coverage 변경에 필요한 검증 세트 선정.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 잔여 리스크를 종료 기록으로 정리.
- `gpt-5.3-codex-spark + xhigh`: `runs/route.ts`의 direct assumptions storage 호출 상태와 public contract, 테스트 후보를 정적 조사.

## 변경 이유
- [사실] 직전 `/work`는 `src/app/api/planning/v2/runs/route.ts`의 assumptions overrides storage 직접 호출을 후속 정리 대상으로 남겼습니다.
- [해석] route에서 직접 storage import만 제거하는 얇은 pass-through보다, snapshot 로드, profile 저장 override, 요청 override 병합, health 산출을 service가 맡아야 ownership boundary가 더 분명합니다.
- [권고] `POST /api/planning/v2/runs`의 request/response/error contract와 assumptions precedence는 유지하고, route는 auth/guard/input/pipeline/response mapping에 집중하게 했습니다.

## 핵심 변경
- `resolvePlanningRunAssumptions` service를 추가해 snapshot, stored override, request override, applied override, health 산출을 route 밖으로 이동했습니다.
- `PlanningRunAssumptionsResolveError`로 `SNAPSHOT_NOT_FOUND`, `SNAPSHOT`, `OVERRIDES` 오류를 route에서 기존 `jsonError` contract로 매핑하게 했습니다.
- `runs/route.ts`에서 assumptions storage, overrides storage, snapshot mapping, merge helper 직접 import를 제거했습니다.
- service 단위 테스트로 stored override + request override 병합과 missing snapshot 오류 contract를 고정했습니다.
- planning route coverage에 `server/assumptions/storage`와 `server/assumptions/overridesStorage` 직접 import 금지 패턴을 추가했습니다.

## 검증
- `corepack pnpm test tests/planning-v2/runAssumptionsRouteService.test.ts tests/planning-v2-api/persistence-routes.test.ts tests/planning-v2-api/run-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 4 files, 44 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm planning:v2:complete` PASS: fast e2e 6 tests 포함.
- `corepack pnpm planning:v2:compat` 2회 FAIL: 내부 `planning:v2:complete failed with code 1`만 출력되고 세부 로그가 없었습니다.
- `corepack pnpm planning:v2:compat --keep-sandbox` PASS, sandbox `/tmp/planning-v2-compat-QTyABG` 확인 후 삭제.
- `corepack pnpm planning:v2:regress` PASS: regression 9 cases, full e2e 8 tests 포함.
- `corepack pnpm lint` PASS.
- `corepack pnpm build` PASS.
- `git diff --check` PASS.

## 남은 리스크
- [리스크] `planning:v2:compat` 일반 실행은 두 번 실패했지만, 동일 코드 상태에서 `--keep-sandbox` 실행은 PASS했습니다. 실패 로그가 내부 complete code 1만 남아 원인 단정은 불가합니다.
- [리스크] 이번 PR은 v2 runs assumptions read/merge 경계만 다뤘고, `reports/[runId]/export.html` read surface 정리는 후속 라운드로 남았습니다.
- [리스크] route path와 화면 셀렉터는 바꾸지 않았으므로 별도 `pnpm e2e:rc`는 실행하지 않았습니다. 대신 `planning:v2:complete` fast e2e와 `planning:v2:regress` full e2e가 통과했습니다.
- [리스크] v2 freeze guard가 core route 변경으로 분류하므로 commit/PR 제목에는 `[v2-core-change]` 태그를 포함해야 합니다.

## 다음 라운드 우선순위
1. `src/app/api/planning/reports/[runId]/export.html/route.ts`의 report read surface를 CSP/print/local-host contract와 함께 별도 평가합니다.
2. 남은 Planning API route service boundary 후보를 route coverage 테스트 기준으로 재스캔합니다.
3. `planning:v2:compat` 일반 실행의 비결정적 실패 로그 확보 방식을 스크립트 개선 후보로 분리합니다.
