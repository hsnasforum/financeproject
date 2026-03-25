# 2026-03-19 N5 planning stable follow-through polish

## 변경 파일

- `src/app/planning/reports/page.tsx`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/components/PlanningRunsClient.tsx`
- `src/components/PlanningTrashClient.tsx`
- `work/3/19/2026-03-19-n5-planning-stable-follow-through-polish.md`

## 사용 skill

- `planning-gate-selector`: planning stable surface의 page/client copy-helper-CTA 변경에 맞는 검증 세트와 `e2e:rc` 실행 여부를 판단하는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 미실행 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `reports / runs / trash` surface에 이미 반영된 문구 변경이 별도 closeout 없이 남아 있어, 오늘 진행한 `N5 public/stable UX polish` 배치 관리 기준과 정합성이 맞지 않았다.
- 현재 diff를 확인한 결과, 이 변경은 route, query contract, run/report data contract, 계산 로직을 건드리지 않고 `planning stable reports-runs follow-through polish` 범위의 copy/helper/CTA/follow-through 조정에 머물렀다.
- 사용자가 먼저 읽어야 하는 `지금 무엇을 보고 있는지`, `다음에 무엇을 할 수 있는지`, `추천/비교 흐름과 어떻게 이어지는지`를 앞세우는 방향으로 배치를 공식 closeout 할 필요가 있었다.

## 핵심 변경

- `/planning/reports` 빈 상태와 대시보드 상단 helper를 `저장된 실행을 다시 읽고 비교/추천 비교 기록으로 이어 보는 화면` 톤으로 정리했다.
- `PlanningReportsDashboardClient`에서 실행 선택, 비교 열기, 저장 리포트 보관, 추천 비교 자료/혜택 후보 열기 문구를 follow-through 중심으로 다듬고, raw 추천 실행 식별자는 `공유·복구용 보조 정보` disclosure 아래로 내렸다.
- `PlanningRunsClient`에서는 실행 기록 목록, 상세, 액션 센터, 비교 요약, 삭제/복구 모달을 `저장된 실행 기록`과 `휴지통으로 이동 후 복구 가능` 흐름으로 다시 읽히게 조정했다.
- `PlanningTrashClient`에서는 휴지통 목적, 복구 우선 원칙, 필터/표 라벨, 확인 모달 설명과 CTA를 쉬운 한국어 기준으로 정리해 불필요한 불안감을 줄이고 다음 행동을 더 분명하게 만들었다.
- 현재 diff는 planning stable surface 내부의 copy/helper/CTA/disclosure 조정에만 머물러 있고, 다른 배치와 섞인 route/API/contract 변경은 확인되지 않았다.

## 검증

- `git diff --check -- src/app/planning/reports/page.tsx src/components/PlanningReportsDashboardClient.tsx src/components/PlanningRunsClient.tsx src/components/PlanningTrashClient.tsx`
- `pnpm lint`
  - 통과
  - 기존 unrelated warning 30건은 그대로 남아 있음
- `pnpm build`
  - 통과

## 미실행 검증

- `pnpm e2e:rc` (selector나 route transition 구조를 의미 있게 바꾸지 않고 copy/helper/CTA/follow-through 위계만 조정해 이번 closeout에서는 미실행)

## 남은 리스크

- 이번 배치는 문구와 위계 정리 중심이어서, 실제 사용자가 planning stable surface를 `확정 답안`보다 `기록/비교/후속 행동 정리 흐름`으로 더 쉽게 읽는지는 별도 사용성 확인이 필요하다.
- `pnpm lint`와 `pnpm build`는 현재 전체 dirty worktree 상태에서 실행됐으므로, 후속 commit 시 이번 planning 배치 포함 범위를 다시 확인해야 한다.
- `PlanningReportsDashboardClient`에는 기존 unrelated lint warning 1건(`selectedRunDetailHref` 미사용)이 계속 남아 있어, 후속 정리 라운드가 필요할 수 있다.
