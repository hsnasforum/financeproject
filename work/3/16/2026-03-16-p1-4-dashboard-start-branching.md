# P1-4 카피와 시작점 정비

## 이번 배치 대상 항목 ID
- `P1-4`

## 변경 파일
- `src/components/DashboardClient.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`

## 핵심 변경
- Dashboard hero에서 최근 실행이 없을 때 시작 CTA를 두 갈래로 분기했다.
- `내 재무 상태 진단하기`는 `/planning`으로, `조건에 맞는 상품 찾기`는 `/recommend`로 직접 연결한다.
- hero 제목과 설명도 두 갈래 시작점 기준으로 맞췄다.
- `P1-4`를 `[완료]`로 반영하고 전체 진행률을 `3 / 13`, Phase 1 진행률을 `3 / 4`로 갱신했다.

## 실행한 검증
- `git diff --check -- src/components/DashboardClient.tsx analysis_docs/v2/financeproject_next_stage_plan.md work/3/16/2026-03-16-p1-4-dashboard-start-branching.md`
- `pnpm build`

## 남은 리스크
- `P1-1`은 RC E2E 광범위 실패 때문에 아직 `[진행중]`이다.
- 이번 배치는 Dashboard hero 진입점 정비만 반영했고, 추천 쪽 세부 preset 연결은 아직 없다.

## 다음 우선순위
- `P2-1 canonical planning-to-recommend contract 정의`

## 사용한 skill
- `route-ssot-check`: dashboard 시작점이 stable route만 가리키는지 재확인
- `planning-gate-selector`: dashboard page 변경에 맞는 최소 검증 선택
- `work-log-closeout`: `/work` closeout 기록 형식 유지
