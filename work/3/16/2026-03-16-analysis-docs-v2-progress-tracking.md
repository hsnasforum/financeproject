# 2026-03-16 analysis_docs v2 진행률 추적 구조 추가

## 변경 파일
- `analysis_docs/v2/README.md`
- `analysis_docs/v2/financeproject_next_stage_plan.md`

## 사용 skill
- `work-log-closeout`: 문서 기반 진행률 구조 추가 라운드의 변경 파일, 검증, 남은 운영 규칙을 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `analysis_docs/v2`를 문서 기준으로 실행할 때, 나중에 봐도 어떤 항목이 실제로 적용됐는지 추적할 수 있는 상태판이 필요했습니다.
- 문서 자체에 진행률과 항목 ID가 없으면 `/work` 배치 기록이 쌓여도 계획 대비 완료 상태를 한눈에 보기 어렵습니다.

## 핵심 변경
- `analysis_docs/v2/README.md`에 v2 실행 추적 규칙을 추가했습니다.
- 상태 표기를 `[미착수]`, `[진행중]`, `[완료]`, `[보류]` 4종으로 고정했습니다.
- `financeproject_next_stage_plan.md` 상단에 전체/Phase 진행률과 상태 표기 규칙, 운영 원칙을 넣었습니다.
- Phase 1~3 세부 항목에 `P1-1`, `P2-3`, `P3-2` 형태의 ID와 초기 상태 `[미착수]`를 부여했습니다.
- `/work`와 commit message에 해당 ID를 함께 남기도록 문서 규칙을 명시했습니다.

## 검증
- `git diff --check -- analysis_docs/v2/README.md analysis_docs/v2/financeproject_next_stage_plan.md`
- `git status --short -- analysis_docs/v2 work/3/16`

## 남은 리스크
- 이 note 작성 당시에는 `analysis_docs/v2/**`가 Git 기준 untracked 상태였고 일반 `git diff --check` 신뢰도가 낮았습니다. 이후 `9c7e33f`에서 구조 closeout이 반영됐지만, 후속 실행 배치에서도 문서와 `/work`를 같이 갱신하지 않으면 상태판이 다시 어긋날 수 있습니다.
- 진행률 숫자는 초기값 `0%`로 넣었던 구조 추가 note라서, 이후 배치 진행 상황은 `financeproject_next_stage_plan.md` 최신 상태와 함께 읽어야 합니다.
