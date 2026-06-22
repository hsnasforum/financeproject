# 2026-06-22 ops action boundary 다음 라운드 계획

## 사용 skill
- 사용 없음: 이번 턴은 구현 전 범위 분해와 잔여 리스크 정리에 집중했습니다.

## 확인한 파일
- `work/6/22/2026-06-22-e2e-doctor-action-helper.md`
- `src/lib/ops/actions/registry.ts`
- `src/lib/planning/server/ops/doctorRouteService.ts`
- `src/app/api/ops/actions/run/route.ts`
- `src/app/api/ops/doctor/route.ts`
- `tests/planning/ops/actions-run-route.test.ts`
- `tests/planning/ops/ops-doctor-route-service-boundary.test.ts`

## 사실
- `registry.ts`는 공용 ops action 실행기이며 `REPAIR_INDEX`, `RUN_MIGRATIONS`, `DELETE_RUN`, `RUNS_CLEANUP` 등을 preview/run 계약으로 제공합니다.
- `doctorRouteService.ts`는 doctor 종합 점검 외에 `REPAIR_INDEX`, `RUN_MIGRATIONS`, `CLEANUP_ORPHAN_BLOBS` 실행과 metrics 기록을 별도로 가지고 있습니다.
- `/api/ops/actions/run`은 preview token, confirmText, audit/metrics/action-log, storage transaction을 포함한 공용 실행 경로입니다.
- `/api/ops/doctor`는 doctor 화면 전용 POST action 경로를 유지하고 있습니다.
- 메인 에이전트가 구현 직전 재확인한 `git status --short --branch` 기준으로 워크트리는 clean이었고, 브랜치는 `origin/main` 대비 ahead 17 상태였습니다.

## 다음 라운드 구현 초점
- `REPAIR_INDEX`와 `RUN_MIGRATIONS`의 실행/계측/오류 계약을 공용 action layer로 수렴할지 결정합니다.
- doctor 전용으로 남겨야 할 범위는 `CLEANUP_ORPHAN_BLOBS`, doctor route user meta, doctor 화면 계약입니다.
- 공용 action layer와 doctor service 사이의 책임 경계를 테스트로 먼저 고정한 뒤 최소 수정으로 옮깁니다.

## 실행한 확인
- PASS: `git status --short`
- 확인: 관련 소스/테스트 정적 읽기

## 미실행 검증
- `corepack pnpm test`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm e2e:rc`

## 이번 라운드 완료 항목
- 최신 `/work` 기록과 잔여 후보 파일을 확인했습니다.
- 다음 구현 라운드의 핵심 경계를 `registry` 대 `doctorRouteService` 중복 제거로 좁혔습니다.
- 메인 직접 작업과 병렬 정적 조사 범위를 분리할 근거를 정리했습니다.

## 남은 리스크
- 구현 전 메인 워크트리는 clean으로 재확인됐습니다. 이후 변경 파일은 이번 라운드 범위로만 stage/commit해야 합니다.
- doctor 전용 액션 계약을 잘못 일반화하면 `/api/ops/doctor` UI와 테스트가 같이 흔들릴 수 있습니다.
- 공용 action 경로로 수렴할 때 audit/metric/meta 차이가 누락될 수 있습니다.

## 다음 라운드 우선순위
- 1. 공용 action 실행 경계와 doctor 전용 경계를 테스트로 고정
- 2. `REPAIR_INDEX`/`RUN_MIGRATIONS` 중복 실행 로직을 한 경로로 수렴
- 3. route/UI 계약 회귀 테스트와 최소 검증 실행
