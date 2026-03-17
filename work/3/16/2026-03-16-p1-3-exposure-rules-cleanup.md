# P1-3 화면 노출 규칙 정리

## 이번 배치 대상 항목 ID
- `P1-3`

## 변경 파일
- `src/components/home/HomeStatusStrip.tsx`
- `src/components/DashboardClient.tsx`
- `src/app/settings/page.tsx`
- `src/app/settings/data-sources/page.tsx`
- `src/components/ExchangeSummaryCard.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`

## 핵심 변경
- public 화면에서 `/settings/data-sources`를 `설정`이 아니라 `데이터 신뢰` 하위 흐름으로 읽히게 카피를 조정했다.
- 홈, 대시보드, 설정 홈, 데이터 신뢰 상세, 환율 요약 카드의 관련 라벨을 같은 기준으로 맞췄다.
- `planning/v3`, `ops`, `dev`, `debug`는 이번 배치에서도 public 헤더/홈에 추가 노출하지 않았다.
- `P1-3`를 `[완료]`로 반영하고 전체 진행률을 `2 / 13`, Phase 1 진행률을 `2 / 4`로 갱신했다.

## 실행한 검증
- `git diff --check -- src/components/home/HomeStatusStrip.tsx src/components/DashboardClient.tsx src/app/settings/page.tsx src/app/settings/data-sources/page.tsx src/components/ExchangeSummaryCard.tsx analysis_docs/v2/financeproject_next_stage_plan.md work/3/16/2026-03-16-p1-3-exposure-rules-cleanup.md`
- `pnpm build`

## 남은 리스크
- `P1-1`은 RC E2E 광범위 실패 때문에 아직 `[진행중]`이다.
- `/settings/data-sources`의 실제 route 이동 없이 copy와 위치 의미만 먼저 조정했다.
- production search나 외부 인덱싱 정책은 저장소 내부에서 직접 검증하지 못했다.

## 다음 우선순위
- `P1-4 카피와 시작점 정비`

## 사용한 skill
- `route-ssot-check`: public 노출 경계와 route 기준 재확인
- `planning-gate-selector`: page/copy 변경에 맞는 최소 검증 선택
- `work-log-closeout`: `/work` closeout 기록 형식 유지
