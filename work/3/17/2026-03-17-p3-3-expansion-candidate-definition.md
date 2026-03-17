# 2026-03-17 P3-3 확장 후보 제품화 기준 정의

## 변경 파일
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `analysis_docs/v2/09_expansion_candidate_productization.md`
- `work/3/17/2026-03-17-p3-3-expansion-candidate-definition.md`

## 사용 skill
- `finance-skill-routing`: docs-only round라 `work-log-closeout` 중심으로만 최소 스킬 조합을 유지하는 기준을 확인하는 데 사용.
- `work-log-closeout`: 후보별 판정 근거, 실행한 검증, 남은 리스크를 오늘 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `/settings/data-sources`의 `확장 후보` 3개는 이미 trust hub 카드로 존재하지만, 실제 제품 backlog에서는 어떤 후보를 어디에 붙일지와 어떤 gate가 먼저 필요한지가 문서로 고정돼 있지 않았습니다.
- 이번 라운드는 후보를 바로 공개 기능으로 승격하는 대신, 사용자 효용·최신성·설명 가능성·운영 비용·규제/오해 리스크 기준으로 다시 분류해 `P3-3` 방향을 먼저 고정하는 설계 배치입니다.

## 핵심 변경
- `retirement`, `insurance`, `macro` 3개 후보를 공통 5축 판정 틀과 `Tier A / Tier B / Tier C` 체계로 다시 분류하는 문서를 추가했습니다.
- `retirement`는 장기 재무결정 지원 후보로 `Tier B`, `macro`는 planning support layer 후보로 `Tier B`, `insurance`는 약관/보장 해석 리스크가 커서 `Tier C`로 고정했습니다.
- host surface가 없는 후보는 backlog-ready가 아니라는 원칙과, trust hub 카드가 실제 공개 기능 상태를 의미하지 않는다는 원칙을 문서에 명시했습니다.
- rollout 우선순위를 `macro -> retirement -> insurance(보류 유지)`로 좁히고, `P3-4`에서는 host surface 역할 분리만 이어받도록 경계를 정리했습니다.
- 상태판에서 `P3-3`을 `[진행중]`으로 올리고, 완료 수는 늘지 않으므로 전체/Phase 3 진행률은 유지했습니다.

## 검증
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md analysis_docs/v2/09_expansion_candidate_productization.md work/3/17/2026-03-17-p3-3-expansion-candidate-definition.md`

## 남은 리스크
- 후보 판정은 현재 저장소와 existing candidate metadata 기준이며, 외부 정책/규정 최신 조사는 이번 라운드 범위에 포함하지 않았습니다.
- `macro`와 `retirement`를 어느 UI 블록으로 시작할지는 `P3-4`의 host surface 역할 분리와 함께 다시 좁혀야 합니다.
- `insurance`는 trust hub candidate로는 남길 수 있지만, 현재 기준으로는 public backlog로 올리기 어렵습니다.
