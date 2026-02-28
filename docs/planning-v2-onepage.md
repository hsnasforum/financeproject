# Planning v2 One-page

## 무엇을 하는 도구인가
- 개인용 로컬 재무설계 시뮬레이터입니다.
- 엔진은 오프라인 순수함수로 계산하고, 최신성은 snapshot 주입으로 분리합니다.
- 결과는 단일값뿐 아니라 시나리오/확률/액션/부채전략 비교를 제공합니다.

## 사용자 흐름 (5줄)
- `/planning`에서 프로필을 선택/편집합니다.
- 필요하면 `snapshotId`를 지정하고 `Run plan`을 실행합니다.
- Summary/Simulate/Scenarios/Monte Carlo/Actions/Debt 탭으로 결과를 확인합니다.
- health critical 경고가 있으면 ack 후 `Save run`으로 저장합니다.
- `/planning/runs`에서 run 비교(diff)와 export를 수행합니다.

## 운영 흐름 (5줄)
- `/ops/assumptions`에서 snapshot sync, history, rollback을 관리합니다.
- `/ops/planning`에서 snapshot/regression/cache/store 상태를 점검합니다.
- 필요 시 `/ops/planning-cache`에서 purge, `/ops/planning-cleanup`에서 retention 정리를 수행합니다.
- 정기 운영은 `pnpm planning:v2:ops:run`(필요 시 `:regress`)으로 실행합니다.
- 장애/복구 후 `pnpm planning:v2:doctor`로 무결성을 확인합니다.

## 안전장치 (5줄)
- planning/ops API는 local-only 중심 정책입니다.
- 가정 스냅샷 신선도/정합성 경고(health)와 ack 게이트를 적용합니다.
- Monte Carlo는 budget guardrail로 과도한 계산을 차단합니다.
- 회귀(regression) 게이트와 baseline 승인 절차로 품질을 고정합니다.
- backup/export/import/restore + doctor로 재현성과 복구 가능성을 확보합니다.

## 자주 쓰는 명령
- `pnpm planning:v2:complete`
- `pnpm planning:v2:ops:run`
- `pnpm planning:v2:doctor`
- `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:smoke:http`
- `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance`
