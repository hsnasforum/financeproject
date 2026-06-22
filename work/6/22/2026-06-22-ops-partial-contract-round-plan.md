# 2026-06-22 ops partial contract round plan

## 변경 파일
- 없음. 구현 전 계획 정리만 수행했습니다.

## 사용 skill
- 없음

## 변경 이유
- 최신 `/work` 기준 잔여 리스크는 `partial` migration 결과가 `/api/ops/actions/run` 및 `/api/ops/doctor`의 operator metric/action log에서 여전히 `SUCCESS`처럼 보일 수 있다는 점입니다.
- 다음 구현 라운드에서 결과 계약, 기록 경로, 검증 범위를 먼저 고정할 필요가 있습니다.

## 다음 라운드 계획
1. `partial` 결과가 생성되는 코드 경로와 응답/metric/log 분기점을 추적합니다.
2. 공용 action result contract에서 `partial`을 `success`와 분리하는 최소 변경 지점을 정합니다.
3. `/api/ops/actions/run`과 `/api/ops/doctor`가 같은 상태 의미를 쓰도록 구현을 맞춥니다.
4. metric, audit/action log, 테스트 기대값을 같은 계약으로 정렬합니다.
5. 메인 에이전트가 lint/test/build 범위를 실행해 최종 PASS/FAIL을 확정합니다.

## 검증
- 실행한 검증 없음. 계획 수립만 수행했습니다.

## 이번 라운드 완료 항목
- 최신 `/work` 기준 잔여 리스크를 확인했습니다.
- 다음 구현 라운드의 핵심 경로와 병렬 조사 가능 범위를 분해했습니다.

## 남은 리스크
- `partial` 상태의 의미가 응답, metric, action log마다 다르면 운영자가 실패 범위를 오판할 수 있습니다.

## 다음 라운드 우선순위
- `partial` 상태 contract 정렬
- 관련 테스트와 operator 관측면 검증
