# Planning v2 Release Notes (1.0.3)

- Version: `1.0.3`
- Date: `2026-03-07`

## Done Definition 요약
- `/planning`에서 프로필 생성/편집/삭제가 가능하다.
- `/planning`에서 latest(또는 snapshotId) 기준으로 `simulate + scenarios`를 실행할 수 있다.
- `/planning`에서 실행 결과를 run으로 저장할 수 있다.
- `/ops/assumptions`에서 snapshot sync와 latest 상태 확인이 가능하다.
- assumptions history가 있으면 조회/rollback(set latest, confirm)이 가능하다.
- `pnpm planning:v2:complete`가 통과한다.
- 로컬 서버 기동 후 `pnpm planning:v2:acceptance`가 통과한다(가능한 환경에서).

## 사용자 기능 요약
- `/planning`에서 프로필을 선택/편집합니다.
- 필요하면 `snapshotId`를 지정하고 `실행` 버튼을 눌러 계산합니다.
- Summary/Simulate/Scenarios/Monte Carlo/Actions/Debt 탭으로 결과를 확인합니다.
- health critical 경고가 있으면 ack 후 `실행 기록 저장`을 수행합니다.
- `/planning/runs`에서 실행 기록 비교(diff)와 export를 수행합니다.

## OPS/운영 기능 요약
- `/ops/assumptions`에서 snapshot sync, history, rollback을 관리합니다.
- `/ops/planning`에서 snapshot/regression/cache/store 상태를 점검합니다.
- 필요 시 `/ops/planning-cache`에서 purge, `/ops/planning-cleanup`에서 retention 정리를 수행합니다.
- 정기 운영은 `pnpm planning:v2:ops:run`(필요 시 `:regress`)으로 실행합니다.
- 장애/복구 후 `pnpm planning:v2:doctor`로 무결성을 확인합니다.

## 최근 변경 요약
- P97-18~20: 사용자/운영/아키텍처 문서, demo seed, offline+HTTP smoke, release checklist.
- P97-21: 에러/메시지/ReasonCode 표준화, 한국어 i18n, API 응답 형식 정리, 테스트 안정화.
- P97-22: debug 라우트 기본 비활성+로컬 제한, 라우트 가드 스캔 추가, env/문서/RC 스모크 최종 점검.
- P97-23~25: 운영 단일 실행/조건부 snapshot sync/report 보관 + 스케줄러 템플릿 + retention cleanup(OPS dry-run/confirm) 완성.
- P97-26: Done Definition 고정, planning 플래그 단일 진입점(config) 정리, HTTP acceptance 스크립트 및 one-page 요약 문서 추가.

## 실행 커맨드
- `pnpm release:prepare -- --version=x.y.z` (버전 bump + changelog 스텁 갱신)
- `pnpm planning:v2:seed`
- `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:smoke:http`
- `PLANNING_BASE_URL=http://localhost:3100 pnpm planning:v2:acceptance`
- `pnpm planning:v2:release:notes`
- `pnpm planning:v2:release:evidence`

## 완성 확인 (3단계)
- pnpm planning:v2:complete
- 서버 실행 후 pnpm planning:v2:acceptance
- 5분 셀프 테스트 체크 완료: docs/planning-v2-5min-selftest.md

## Known Limitations
- 확률/시나리오 결과는 가정 기반이며 보장값이 아닙니다.
- Monte Carlo/상품 후보는 서버 플래그 또는 예산 정책으로 비활성화될 수 있습니다.
- snapshot 동기화 실패 시 마지막 스냅샷을 유지하며 경고를 확인해야 합니다.
- acceptance 스모크는 로컬 서버 실행(PLANNING_BASE_URL)이 필요합니다.
- 개인 로컬 전제이며 planning/ops API는 local-only 정책을 따릅니다.
