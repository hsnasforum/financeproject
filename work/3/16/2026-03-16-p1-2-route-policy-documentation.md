# P1-2 route policy 문서화

## 이번 배치 대상 항목 ID
- `P1-2`

## 변경 파일
- `docs/current-screens.md`
- `analysis_docs/v2/financeproject_next_stage_plan.md`

## 핵심 변경
- `docs/current-screens.md` 상단에 route policy 분류 기준 5개를 명시했다.
- 기존 카탈로그 구간명을 `Public Stable / Public Beta / Legacy Redirect / Local-only Ops / Dev/Debug` 체계로 정리했다.
- `/planning/reports/prototype`, `/planning/v3/*`, `/ops/*`, `/dashboard/artifacts`, `/debug/*`, `/dev/*`의 노출 경계를 경계 메모에 명시했다.
- `P1-2`를 `[완료]`로 반영하고 전체 진행률을 `1 / 13`, Phase 1 진행률을 `1 / 4`로 갱신했다.

## 실행한 검증
- `git diff --check -- docs/current-screens.md analysis_docs/v2/financeproject_next_stage_plan.md work/3/16/2026-03-16-p1-2-route-policy-documentation.md`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- `P1-1`은 RC E2E 광범위 실패 때문에 아직 `[진행중]`이다.
- 현재 route policy는 문서 분류까지 반영한 상태이며, 실제 header/home/search 노출 제어 정리는 `P1-3`에서 더 확인해야 한다.

## 다음 우선순위
- `P1-3 화면 노출 규칙 정리`

## 사용한 skill
- `route-ssot-check`: route 분류 체계와 current-screens 문서 정합성 점검
- `planning-gate-selector`: 문서 변경 배치에 맞는 최소 검증 선택
- `work-log-closeout`: `/work` closeout 기록 형식 유지
