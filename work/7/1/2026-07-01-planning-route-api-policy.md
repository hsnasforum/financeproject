# 2026-07-01 Planning route/API 정책 정리

## 변경 파일
- `src/lib/planning/routes.ts`
- `src/lib/planning/server/runs/createRunRouteAdapter.ts`
- `src/app/api/planning/run/route.ts`
- `src/app/api/planning/v2/run/route.ts`
- `src/app/api/planner/compute/route.ts`
- `src/app/planner/page.tsx`
- `src/app/report/page.tsx`
- `src/lib/planning/legacyPlannerRedirect.ts`
- `docs/current-screens.md`
- `docs/planner-deprecated-cleanup.md`
- `scripts/planning_v2_static_guard.mjs`
- `tests/planning/catalog/planningRoutePolicy.test.ts`
- `tests/planning/auth/planningRouteUserScopeCoverage.test.ts`

## 사용 skill
- `planning-gate-selector`: route/API 정책 변경에 맞는 current-screens, SSOT, auth, engine, build 검증 범위를 정했습니다.
- `route-ssot-check`: 공식 planning route/API, legacy redirect, v3 beta entry 노출 정책이 `docs/current-screens.md`와 맞는지 확인했습니다.
- `work-log-closeout`: 변경 파일, 검증 결과, 남은 리스크를 `/work`에 정리했습니다.

## 변경 이유
- 통합 Markdown 2순위 Issue인 `[Critical] Planning 공식 route/API와 legacy/v3/alias 노출 정책 정리`를 처리하기 위해서입니다.
- 기존에는 `/api/planning/run`, `/api/planning/v2/run`, `/api/planner/compute`, `/planner`, `/report`의 canonical/deprecated 기준이 코드와 문서에 흩어져 있었습니다.
- legacy route/API 삭제는 telemetry/access log와 사용처 확인 전까지 확정하지 말아야 하므로, 제거 대신 정책 registry와 deprecation metadata를 먼저 고정했습니다.

## 핵심 변경
- `src/lib/planning/routes.ts`에 공식 planning 사용자 경로, canonical run API, v3 official beta entry, legacy redirect, deprecated API 정책을 모았습니다.
- `/api/planning/run`과 `/api/planning/v2/run`은 canonical create-run adapter를 그대로 쓰면서 `Deprecation: true`, `X-Planning-Canonical-Route`, `meta.deprecatedApi`를 반환하게 했습니다.
- `/api/planner/compute`는 local contract를 제거하고 같은 policy registry를 사용하며, `meta.legacyApi`와 deprecation headers를 반환하게 했습니다.
- `/planner`, `/report`, legacy planner redirect helper가 canonical route 상수를 사용하도록 바꿨습니다.
- `docs/current-screens.md`와 `docs/planner-deprecated-cleanup.md`에 canonical/deprecated API 정책, v3 entry overlay, removal 보류 조건을 문서화했습니다.
- route policy, public nav의 v3 미노출, deprecated API 응답 header/meta를 테스트로 고정했습니다.

## 검증
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm test tests/planning/catalog/currentScreens.fullRouteSet.test.ts tests/planning/catalog/currentScreens.experimentalRoutes.test.ts tests/planning/catalog/currentScreens.reportRoutes.test.ts tests/planning/catalog/catalog-ssot.test.ts tests/planning/catalog/planningRoutePolicy.test.ts'`: PASS, 5 files / 15 tests.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm test tests/planning-v2-api/persistence-routes.test.ts tests/planning/auth/routeAuth.test.ts'`: PASS, 2 files / 25 tests. metrics/audit 실패 주입 stderr는 해당 테스트의 의도된 fallback 확인 출력입니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm planning:current-screens:guard'`: PASS, 5 files / 9 tests.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm planner:deprecated:guard'`: PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm planning:ssot:check'`: PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm planning:v2:engine:guard'`: PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc "rg -n '(/api/planner/compute|/api/planning/run|/api/planning/v2/run|/planning/v3|/planner|/report)' src docs tests scripts"`: exit 0, v3 내부 구현/문서/legacy inventory까지 대량 출력. 삭제 판단용으로는 너무 넓어 후속 좁은 조회를 추가했습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc "rg -n '(/api/dev|pnpm|scripts/|planning:|planner:deprecated)' src/app/api/planning/run src/app/api/planning/v2/run src/app/api/planner/compute src/lib/planning/routes.ts src/lib/planning/server/runs/createRunRouteAdapter.ts tests/planning/catalog/planningRoutePolicy.test.ts"`: exit 1, 매치 없음. 이번 public API 응답 변경 경로에는 내부 dev/script 명령 문자열이 없습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm lint'`: PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm test'`: 첫 실행 FAIL, 2 failures. 원인: 새 route policy registry의 `/planner` 문자열이 static guard allowlist에 없었고, deprecation header만 붙이는 auth error wrapper가 header-only wrapper 패턴에 아직 반영되지 않았습니다.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm test tests/planning-v2-static-guard.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts'`: PASS, 2 files / 35 tests.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm test'`: 최종 PASS, 741 files / 2452 tests.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm lint'`: 최종 PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm build'`: PASS, static pages 251/251.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm planning:ssot:check'`: 최종 PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm planning:v2:engine:guard'`: 최종 PASS.
- `wsl -d Ubuntu --cd /home/xpdlqj/code/finance bash -lc 'corepack pnpm planner:deprecated:guard'`: 최종 PASS.
- `git diff --check -- <이번 Planning 변경 파일>`: PASS.

## 남은 리스크
- legacy API와 redirect route는 삭제하지 않았습니다. 실제 sunset, redirect, 410 전환은 telemetry/access log와 외부 사용처 확인 후 별도 Issue/PR에서 결정해야 합니다.
- `/api/planner/compute`의 canonical hint는 현재 run 생성/리포트 API 체계인 `/api/planning/v2/runs`로 안내하지만, 완전한 대체 API matrix는 후속 정리가 필요합니다.
- Planning v3 route inventory 자체는 여전히 넓습니다. 이번 변경은 public nav/home/docs stable 노출을 막고 official beta entry overlay를 문서·테스트로 고정하는 데 한정했습니다.
- 현재 working tree에는 이번 #115 변경 외에 이전 라운드의 대규모 미커밋 변경이 이미 존재합니다. stage/commit/push는 수행하지 않았습니다.
- 등록한 Issue #116~#125는 후속 라운드 대상으로 남아 있습니다.
