# Planning v2 Freeze

## 목적
- Planning v2는 실사용 가능한 기준선으로 동결(FREEZE)합니다.
- v2는 bugfix/안정화 중심으로만 유지하고, 신규 기능은 v3 트랙에서만 진행합니다.

## v2 포함 범위 (고정)
- `src/lib/planning/v2/*`: planning v2 엔진/계산/DTO/리포트 뷰모델
- `src/lib/planning/core/v2/*`: core v2 계산 및 HTML report 경로
- `/planning` UI 및 `/api/planning/v2/*` 실행/저장/리포트 흐름
- `/ops/assumptions` 운영 흐름, run store, regression, complete/acceptance 게이트

## v2 제외 범위 (= v3)
- 계좌연동/마이데이터 실연동
- 정밀 세금/연금 모델 고도화
- optimizer 정식 기능화(실험 토글을 넘는 자동 최적화)
- 멀티유저/암호화 기본 탑재(옵션 기능 포함)

## 변경 규칙
- v2 코어 변경 시 아래 게이트를 모두 실행합니다.
  - `pnpm planning:v2:complete`
  - `pnpm planning:v2:regress`
- regression baseline 업데이트는 승인/확인(confirm) 없이 수행하지 않습니다.
- v2 코어 변경 커밋에는 `[v2-core-change]` 태그를 권장합니다.
- 신규 기능 제안/개발은 v3 문서/브랜치에서 진행합니다.

## 운영 메모
- 정보성 가드: `pnpm planning:v2:freeze:guard`
  - 코어 변경 파일 목록과 필수 게이트를 출력합니다.
  - 개발 방해를 줄이기 위해 종료코드는 항상 0입니다.
