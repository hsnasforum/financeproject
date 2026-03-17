# 2026-03-16 P2-2 planning context strip

## 이번 배치 대상 항목 ID
- `P2-2`

## 변경 파일
- `src/app/recommend/page.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-2-planning-context-strip.md`

## 사용 skill
- `planning-gate-selector`: 결과 화면 UI 변경에 맞는 최소 검증을 `pnpm build`로 고르는 데 사용.
- `work-log-closeout`: 이번 결과 화면 설명 배치의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P2-2`는 producer/consumer handoff가 열린 상태였지만, `/recommend` 결과 화면에서는 현재 추천이 어떤 플래닝 맥락에서 열렸는지 사용자가 바로 읽기 어려웠습니다.
- 이번 라운드는 새 DTO나 explanation 재설계 없이, 이미 흐르고 있는 `profile.planning`, `meta.planning`, `meta.planningLinkage`만으로 작은 설명 블록을 노출하는 것이 목적이었습니다.

## 핵심 변경
- 추천 결과 header 아래, recommendation grid 위에 planning handoff가 있을 때만 보이는 작은 context strip을 추가했습니다.
- strip은 planning stage, 연결 방식(summary 기반 / legacy planningContext 기반), optional overall status, planning runId를 쉬운 한국어로 보여줍니다.
- `planning-summary`일 때는 “현재 플래닝 결과 기준으로 연 추천”으로, `planning-context`일 때는 “현재 플래닝 입력값을 바탕으로 연 추천”으로 문구를 나눴습니다.
- handoff가 없으면 strip은 아예 렌더하지 않도록 숨겼습니다.
- 이번 라운드에서는 추천 점수 계산, CTA, explanation DTO, API contract은 건드리지 않았습니다.

## 검증
- `pnpm build`
  - 통과.
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/app/recommend/page.tsx work/3/16/2026-03-16-p2-2-planning-context-strip.md`

## 남은 리스크
- strip은 현재 `meta.planning`, `meta.planningLinkage`, 저장된 profile에 있는 값만 사용하므로, handoff projection이 더 풍부해지기 전까지는 stage/출처/runId 수준 설명에 머뭅니다.
- 이번 라운드는 결과 화면 설명 1건만 추가했고, 추천 카드별 “왜 이 상품인가” 설명 재구성은 아직 열지 않았습니다.
- legacy planningContext 기반일 때는 metrics 개수만으로 설명하므로, 후속 라운드에서 사용자 문구를 더 다듬을 여지가 있습니다.

## 다음 우선순위
- `P2-2` 후속: 현재 strip에 있는 planning handoff를 결과 explanation 영역과 어떻게 자연스럽게 연결할지 범위를 좁혀 결정
- `P2-3`: action preset/CTA mapping을 열지 말지, 아니면 recommend 결과 explanation을 먼저 더 다듬을지 우선순위 결정
