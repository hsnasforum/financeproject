# 2026-06-22 ops contract alignment 다음 라운드 계획

## 사용 skill
- 사용 없음: 이번 턴은 최신 `/work` 확인과 다음 구현 라운드 분해만 수행했습니다.

## 확인한 파일
- `work/6/22/2026-06-22-ops-action-maintenance-boundary.md`
- `src/app/api/ops/actions/run/route.ts`
- `src/app/api/ops/doctor/route.ts`
- `src/lib/ops/actions/registry.ts`
- `src/lib/planning/server/ops/doctorRouteService.ts`
- `tests/planning/ops/actions-run-route.test.ts`
- `tests/planning/ops/ops-doctor-route-service-boundary.test.ts`

## 사실
- 최신 `/work`는 `work/6/22/2026-06-22-ops-action-maintenance-boundary.md`입니다.
- 최신 기록 기준 검증은 `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm build`까지 PASS였습니다.
- 잔여 리스크는 `/api/ops/actions/run`과 `/api/ops/doctor`의 audit/metric/meta 계약 차이, 그리고 doctor의 `RUN_MIGRATIONS` 실패 결과 성공 오판 가능성입니다.
- 사용자 공유 정보 기준 브랜치는 clean 상태이고 `0369f924` 이후 `ahead 18`입니다.

## 다음 라운드 초점
- 공통 실행 결과 계약을 먼저 정의하고 `actions/run`과 `doctor`가 같은 성공/실패 판정을 쓰게 정렬합니다.
- `RUN_MIGRATIONS` 실패 판정과 meta shape를 테스트로 먼저 고정한 뒤 최소 수정으로 route/service를 맞춥니다.
- 최종 `pnpm build`와 필요 시 `pnpm e2e:rc`는 메인 에이전트가 단독 실행합니다.

## 실행한 확인
- PASS: 최신 `/work` 및 검증 결과 확인
- PASS: 관련 route/service/test 위치 확인

## 미실행 검증
- `corepack pnpm test`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm e2e:rc`

## 이번 라운드 완료 항목
- 다음 구현 라운드의 영향 파일, 핵심 경로, 검증 소유권을 정리했습니다.
- 병렬 정적 조사 가능 범위와 메인 단독 검증 범위를 분리했습니다.

## 남은 리스크
- doctor 전용 계약을 공통 실행 계약으로 과도하게 일반화하면 `/api/ops/doctor` 응답 shape가 흔들릴 수 있습니다.
- migration 실행 결과의 원본 구조를 충분히 확인하지 않으면 성공/실패 판정이 다시 어긋날 수 있습니다.

## 다음 라운드 우선순위
- 1. `RUN_MIGRATIONS` 성공/실패 판정 테스트 고정
- 2. `actions/run`과 `doctor`의 audit/metric/meta 계약 차이 명시 및 정렬
- 3. 관련 route/service 테스트 후 메인 단독 build 실행
