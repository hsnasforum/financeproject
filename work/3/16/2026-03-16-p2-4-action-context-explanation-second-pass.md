# 2026-03-16 P2-4 action-context explanation second pass

## 변경 파일
- `src/app/recommend/page.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-4-action-context-explanation-second-pass.md`

## 사용 skill
- `planning-gate-selector`: `/recommend` 결과 화면 텍스트/레이아웃 변경에 맞는 최소 검증을 `pnpm build`로 고르는 데 사용.
- `work-log-closeout`: 이번 second pass 범위의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P2-4` first pass에서는 결과 화면 상단 strip에서만 action context를 읽을 수 있었고, 각 카드의 `추천 사유` 영역과는 아직 느슨하게 떨어져 있었습니다.
- 이번 라운드는 API나 saved run 계약을 건드리지 않고, 결과 카드의 why 섹션 앞에 짧은 action helper를 넣어 설명 흐름을 더 자연스럽게 잇는 것이 목적이었습니다.

## 핵심 변경
- `/recommend`에서 `BUILD_EMERGENCY_FUND`, `COVER_LUMP_SUM_GOAL` 두 action code만 읽는 `actionReasonContext` helper를 추가했습니다.
- 결과 카드의 `추천 사유` 영역 제목을 action 맥락형 문구로 바꾸고, 상단 strip과 함께 읽으라는 짧은 helper 문장을 앞에 붙였습니다.
- `item.reasons` 자체는 그대로 두고, 기존 추천 사유 목록을 더 이해하기 쉽게 맥락화하는 수준으로만 보강했습니다.
- `REDUCE_DEBT_SERVICE`나 다른 action code에는 이번 라운드에서 새 설명 분기를 열지 않았습니다.
- recommend API request, saved run, history/report 계약은 이번 라운드에서 손대지 않았습니다.

## 검증
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/app/recommend/page.tsx work/3/16/2026-03-16-p2-4-action-context-explanation-second-pass.md`

## 남은 리스크
- 이번 라운드는 카드 why 앞 helper 문장만 추가했으므로, 카드별 추천 근거를 action별로 다시 조직하거나 재계산하지는 않았습니다.
- `REDUCE_DEBT_SERVICE`는 debt catalog route로 가는 별도 CTA라, 결과 화면 action 설명 연결 대상에는 아직 포함되지 않습니다.
- action context는 여전히 query 기반 view-only 정보라, 저장된 결과 재열람이나 history 재진입까지 이어지지는 않습니다.

## 다음 우선순위
- `P2-4` 후속: action context를 카드 상세 why나 비교함 진입 문구와 어디까지 연결할지 범위 좁히기
- `P2-5` 준비: 현재 query 기반 action context를 history/report와 어떤 기준으로 연결할지 설계 정리
