# 2026-06-23 v2 runs route service boundary

## 요약
- `/api/planning/v2/runs` list/create 경로의 직접 repository, sanitizer, audit, metrics store 의존성을 route service 뒤로 이동했습니다.
- route는 guard/auth/query/body 검증, 계산 파이프라인, `jsonOk/jsonError` 매핑을 유지합니다.
- `routeService.ts`가 run 목록 응답, progress summary 메타, profile/baseline 조회, run 생성 응답 정규화, create audit, stage metrics 기록을 소유합니다.
- legacy alias `/api/planning/run`, `/api/planning/v2/run`은 계속 `runsPost` 위임 계약을 유지합니다.
- source-boundary 회귀 테스트로 `runs/route.ts`의 direct store/sanitizer/audit/metrics import 재유입을 막았습니다.

## 변경 파일
- `src/app/api/planning/v2/runs/route.ts`
- `src/lib/planning/server/runs/routeService.ts`
- `tests/planning-v2-api/persistence-routes.test.ts`

## 사용 skill
- `finance-skill-routing`: Finance Project 기본/조건부 skill 적용 범위 확인.
- `planning-gate-selector`: v2 core route 변경에 필요한 최소/조건부 검증 세트 선정.
- `work-log-closeout`: 이번 라운드 종료 기록 형식 반영.
- Spark 조건부 지침은 인지했지만, 이번 작업은 `manager` 분해 후 메인 에이전트가 구현·최종 검증을 단일 소유했습니다.

## 검증
- `corepack pnpm test tests/planning-v2-api/persistence-routes.test.ts tests/planning/auth/planningRouteUserScopeCoverage.test.ts` PASS
- `corepack pnpm lint` PASS
- `corepack pnpm build` PASS
- `corepack pnpm planning:v2:complete` PASS
- `corepack pnpm planning:v2:compat` PASS
- `corepack pnpm planning:v2:regress` PASS

## 참고
- WSL PATH에 `pnpm` shim이 없어 최초 `pnpm test ...`는 `pnpm: command not found`로 실패했습니다.
- 이후 `corepack pnpm`으로 같은 검증을 재실행해 통과시켰습니다.
- 첫 `build` 호출은 184초 timeout 뒤 백그라운드에서 종료되어 PASS/FAIL 출력을 확보하지 못했고, 긴 제한 시간으로 재실행해 PASS를 확인했습니다.

## 남은 리스크
- `POST /api/planning/v2/runs`의 계산 파이프라인 자체는 아직 route 파일에 남아 있습니다.
- 이번 PR은 저장소/응답 정규화/기록 경계 정리이며, 전체 오케스트레이션 service 추출은 별도 라운드가 안전합니다.
- source-boundary 테스트는 직접 import 재유입 방지에 초점을 둡니다. 응답 shape 변화는 기존 persistence/auth/e2e/regression 게이트로 보완합니다.

## 다음 우선순위
1. `runs/route.ts`에 남은 긴 계산 오케스트레이션을 입력 검증/파이프라인 구성 단위로 더 작게 분리할지 판단합니다.
2. 다음 route 후보도 direct repository/sanitizer import가 있는지 재스캔한 뒤 같은 작은 PR 단위로 정리합니다.
3. v2 route boundary 정리가 끝나면 planning v3 repository/data ownership 정리로 넘어갑니다.
