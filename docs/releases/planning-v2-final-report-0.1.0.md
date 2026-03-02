# Planning v2 Final Report (0.1.0)

- Version: `0.1.0`
- GeneratedAt: `2026-03-01T09:29:30.741Z`

## 1) Done Definition 요약
- `/planning`에서 프로필 생성/편집/삭제가 가능하다.
- `/planning`에서 latest(또는 snapshotId) 기준으로 `simulate + scenarios`를 실행할 수 있다.
- `/planning`에서 실행 결과를 run으로 저장할 수 있다.
- `/planning/runs`에서 run 목록 조회/삭제가 가능하다.
- `/planning/runs`에서 run 2개 비교(diff)가 가능하다.
- `/planning/runs`에서 run JSON export(다운로드 또는 copy)가 가능하다.
- `/ops/assumptions`에서 snapshot sync와 latest 상태 확인이 가능하다.
- assumptions history가 있으면 조회/rollback(set latest, confirm)이 가능하다.
- `/ops/planning`에서 snapshot/regression/cache/store 상태를 한 화면에서 확인할 수 있다.
- `/ops/planning-cleanup`이 있으면 dry-run과 confirm apply로 정리 작업을 수행할 수 있다.

## 2) 기능 범위
### 사용자
- `/planning`에서 프로필을 선택/편집합니다.
- 필요하면 `snapshotId`를 지정하고 `실행` 버튼을 눌러 계산합니다.
- Summary/Simulate/Scenarios/Monte Carlo/Actions/Debt 탭으로 결과를 확인합니다.
- health critical 경고가 있으면 ack 후 `실행 기록 저장`을 수행합니다.
- `/planning/runs`에서 실행 기록 비교(diff)와 export를 수행합니다.
### OPS
- `/ops/assumptions`에서 snapshot sync, history, rollback을 관리합니다.
- `/ops/planning`에서 snapshot/regression/cache/store 상태를 점검합니다.
- 필요 시 `/ops/planning-cache`에서 purge, `/ops/planning-cleanup`에서 retention 정리를 수행합니다.
- 정기 운영은 `pnpm planning:v2:ops:run`(필요 시 `:regress`)으로 실행합니다.
- 장애/복구 후 `pnpm planning:v2:doctor`로 무결성을 확인합니다.

## 3) 검증 결과
| Gate | Status | Command | Log | Note |
|---|---|---|---|---|
| complete | PASS | `pnpm planning:v2:complete` | `.data/planning/release/logs/final-report-0.1.0-complete.log` | - |
| regress | PASS | `pnpm planning:v2:regress` | `.data/planning/release/logs/final-report-0.1.0-regress.log` | - |
| acceptance | PASS | `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance` | `.data/planning/release/logs/final-report-0.1.0-acceptance.log` | - |

## 4) 문서/증빙
- docs/planning-v2-onepage.md
- docs/planning-v2-user.md
- docs/planning-v2-ops.md
- docs/planning-v2-architecture.md
- docs/planning-v2-done-definition.md
- docs/planning-v2-release-checklist.md
- docs/planning-v2-5min-selftest.md
- 릴리즈 노트: `docs/releases/planning-v2-0.1.0.md`

## 5) 운영 루틴
- 일상 운영: `pnpm planning:v2:ops:run`
- 주간/변경 후 회귀: `pnpm planning:v2:ops:run:regress`
- 스케줄러 템플릿: `docs/planning-v2-scheduler.md`

## 6) 백업/복구 요약
- 백업/복구 후 `pnpm planning:v2:doctor`로 무결성을 확인합니다.
- snapshot 문제 시 `/ops/assumptions`에서 history 확인 후 latest 포인터를 복구합니다.
- 운영 데이터 정리는 `/ops/planning-cleanup` 또는 retention 정책으로 수행합니다.

## 7) Known Limitations
- 확률/시나리오 결과는 가정 기반 계산이며 미래를 보장하지 않습니다.
- acceptance는 로컬 서버 실행(PLANNING_BASE_URL) 환경에서만 검증됩니다.
- snapshot 품질과 신선도에 따라 결과가 달라질 수 있습니다.
- includeProducts는 서버 플래그/키 상태에 따라 비활성화될 수 있습니다.
- 개인용 로컬 전제를 기준으로 local-only 정책을 따릅니다.

## 8) 다음 확장 후보
- 회귀 코퍼스에 사용자 페르소나별 장기/단기 혼합 시나리오 확장
- 운영 대시보드에서 게이트 추이(주간 PASS/FAIL) 시각화
- 스냅샷 소스 품질 점수(파싱 성공률) 기록
- actions/debt 문구의 가독성 A/B 점검
- release evidence 번들 무결성 체크섬 자동 포함
