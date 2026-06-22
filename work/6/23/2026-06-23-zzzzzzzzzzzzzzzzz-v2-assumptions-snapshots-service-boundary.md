# 2026-06-23 v2 assumptions snapshots service boundary

## 변경 파일
- `src/app/api/planning/v2/assumptions/snapshots/route.ts`
- `src/lib/planning/server/assumptions/snapshotsRouteService.ts`
- `tests/planning-v2-api/assumptions-snapshots-route.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzzzz-v2-assumptions-snapshots-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`의 다음 우선순위인 Planning API service-boundary 재스캔을 이번 라운드로 선택.
- `planning-gate-selector`: Planning API route, auth/user-scope coverage, assumptions snapshot read 경계 변경에 필요한 검증 세트 선정.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 잔여 리스크를 종료 기록으로 정리.
- `gpt-5.3-codex-spark + xhigh`: 남은 route service-boundary 후보와 coverage 누락 패턴을 정적 조사.

## 변경 이유
- [사실] 직전 `/work`는 남은 Planning API route service-boundary 후보 재스캔을 다음 우선순위로 남겼습니다.
- [사실] Spark 정적 조사와 메인 스캔에서 `src/app/api/planning/v2/assumptions/snapshots/route.ts`가 `lib/planning/assumptions/storage`를 직접 import하는 단일 route 후보로 확인됐습니다.
- [해석] route가 assumptions storage 접근과 snapshot stale/projection 생성을 직접 수행하면 route 책임이 guard/auth/query/response mapping을 넘어섭니다.

## 핵심 변경
- `listRouteAssumptionsSnapshots` service를 추가해 assumptions history/latest storage 접근과 staleDays, warningsCount, korea summary projection을 route 밖으로 이동했습니다.
- assumptions snapshots route는 same-origin guard, `requirePlanningRouteUser`, limit parsing, `jsonOk`/`jsonError` 응답 매핑만 유지하도록 정리했습니다.
- route 테스트에 storage 접근이 service 뒤에 있는지 확인하는 source boundary assertion을 추가했습니다.
- planning auth coverage에 `/planning/assumptions/storage` 직접 import 금지 패턴을 추가해 같은 누락이 재발하지 않게 했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/assumptions-snapshots-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 2 files, 35 tests.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm lint` PASS.
- `corepack pnpm planning:v2:complete` PASS: guard, security scan, freeze guard, route guard scan, report/guide tests, smoke, fast e2e 6 tests 포함.
- `corepack pnpm planning:v2:regress` PASS: regression 9 cases, full e2e 8 tests 포함.
- `corepack pnpm build` PASS.
- `git diff --check` PASS.
- `corepack pnpm multi-agent:guard` PASS: latest `/work` tracked.

## 남은 리스크
- [리스크] 이번 PR은 `lib/planning/assumptions/storage` 직접 import 누락 패턴과 snapshots route만 닫았습니다. Spark가 확인한 v3 repository direct import 32개, v2 trash/report/profile 계열은 후속 라운드로 남습니다.
- [리스크] route path, query 이름, 응답 shape는 유지했으므로 별도 `pnpm e2e:rc`는 실행하지 않았습니다. 대신 `planning:v2:complete` fast e2e와 `planning:v2:regress` full e2e가 `/api/planning/v2/assumptions/snapshots?limit=30` 200 흐름을 반복 확인했습니다.
- [리스크] freeze guard가 v2 core change로 분류했으므로 commit/PR 제목에는 `[v2-core-change]` 태그가 필요합니다.

## 다음 라운드 우선순위
1. v2 `runs/[id]/report`, `runs/[id]/report.pdf`, `runs/[id]/export` 계열을 한 family로 묶을지 route별로 자를지 결정합니다.
2. v2 `trash` route family의 repository 직접 호출을 route service로 이동할 후보로 검토합니다.
3. v3 repository 직접 import 32개는 v3 batch/news/account family별로 별도 narrowing 계획을 세웁니다.
