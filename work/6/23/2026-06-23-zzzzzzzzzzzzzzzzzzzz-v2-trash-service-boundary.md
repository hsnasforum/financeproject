# 2026-06-23 v2 trash service boundary

## 변경 파일
- `src/app/api/planning/v2/trash/route.ts`
- `src/app/api/planning/v2/trash/restore/route.ts`
- `src/app/api/planning/v2/trash/empty/route.ts`
- `src/lib/planning/server/trash/routeService.ts`
- `tests/planning-v2-api/trash-route.test.ts`
- `work/6/23/2026-06-23-zzzzzzzzzzzzzzzzzzzz-v2-trash-service-boundary.md`

## 사용 skill
- `finance-skill-routing`: 최신 `/work`의 다음 우선순위인 v2 `trash` route family service-boundary 라운드를 선택.
- `planning-gate-selector`: Planning v2 API route/core 변경에 맞는 targeted tests, lint, build, complete, regress 게이트 선정.
- `work-log-closeout`: 실제 변경 파일, 실행 검증, 잔여 리스크를 종료 기록으로 정리.

## 변경 이유
- [사실] 직전 `/work`는 v2 `trash` route family의 repository 직접 호출을 route service로 이동하는 것을 다음 우선순위로 남겼습니다.
- [사실] `trash`, `trash/restore`, `trash/empty` route는 profiles/runs/reports/trash repository와 audit store를 직접 호출했습니다.
- [해석] route는 guard/auth/body parsing/confirm 검증/response mapping만 담당하고, current-user trash 조회·복구·영구삭제·비우기 및 audit append는 server service가 담당하는 편이 최근 v2 route service-boundary 흐름과 일관됩니다.

## 핵심 변경
- `src/lib/planning/server/trash/routeService.ts`를 추가해 trash list, hard-delete, restore, empty 실행과 audit append를 route 밖으로 이동했습니다.
- `trash`, `trash/restore`, `trash/empty` route는 same-origin/CSRF guard, planning auth, 입력 검증, confirm mismatch 처리, JSON 응답 매핑만 유지하도록 정리했습니다.
- confirm mismatch audit도 service helper로 기록하게 해 route의 audit store 직접 import를 제거했습니다.
- `trash-route.test.ts`에 세 trash route가 repository와 audit store를 직접 import하지 않는 source boundary assertion을 추가했습니다.
- Spark 정적 조사 시도는 `gpt-5.3-codex-spark` 사용량 제한으로 실패했고, manager 분해와 메인 정적 검토로 대체했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/trash-route.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS: 2 files, 35 tests.
- `corepack pnpm lint` 1차 PASS(exit 0): unused type import warning 2건 확인 후 수정.
- `corepack pnpm lint` 2차 PASS: warning 없이 완료.
- `corepack pnpm build` PASS.
- `corepack pnpm planning:v2:complete` PASS: guard, sec:check, freeze guard, route guard scan, report/guide tests, smoke, fast e2e 6 tests 포함.
- `corepack pnpm planning:v2:regress` PASS: regression 9 cases, full e2e 8 tests 포함.
- `git diff --check` PASS.
- `git diff --cached --check` PASS.
- `corepack pnpm multi-agent:guard` PASS: staged 상태에서 최신 `/work` note 추적 확인.

## 남은 리스크
- [리스크] audit event 이름과 사용자 응답 shape는 유지했지만 audit details 내부 필드는 service에서 구성합니다. 외부 UI 계약은 아니나 운영 로그 소비자가 세부 details 키를 엄격히 기대한다면 별도 확인이 필요합니다.
- [리스크] route path, 사용자 화면, selector는 변경하지 않았으므로 별도 route SSOT 문서 변경과 `pnpm e2e:rc`는 실행하지 않았습니다.

## 다음 라운드 우선순위
1. v2 `runs/[id]` detail/action-plan 계열의 current-user run read boundary를 별도 라운드로 나눌지 결정합니다.
2. v3 repository 직접 import 32개는 batch/news/account family별 narrowing 계획으로 분리합니다.
3. Auth/User Scope 표준화 후보인 `withCurrentPlanningUser` 직접 사용 route 5개를 최신 상태 기준으로 재확인합니다.
