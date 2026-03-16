# 2026-03-17 P3-4 support layer 역할 분리 정의

## 변경 파일
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `analysis_docs/v2/10_support_layer_role_separation.md`
- `work/3/17/2026-03-17-p3-4-role-separation-definition.md`

## 사용 skill
- `finance-skill-routing`: docs-only round 기준으로 `work-log-closeout` 중심의 최소 스킬 조합을 유지하는 데 사용.
- `work-log-closeout`: 역할 분리 결정, 실행한 검증, 남은 리스크를 오늘 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P3-3`에서 확장 후보의 tier와 host 후보는 정리됐지만, 기존 stable 기능인 `DART / 혜택 / 주거 / 환율`이 어떤 surface에서 어떤 역할로만 읽혀야 하는지는 아직 문서로 고정되지 않았습니다.
- 이번 라운드는 기능 스프롤을 막기 위해, existing route를 유지하되 `planning / recommend / public info / trust hub` 사이 역할 경계를 먼저 정의하는 docs-only 배치입니다.

## 핵심 변경
- `DART / 혜택 / 주거 / 환율` 각각의 primary host, secondary host, standalone 유지 여부, public helper 범위, trust hub owner 범위를 하나의 role matrix로 정리했습니다.
- 공통 규칙으로 `standalone 유지`와 `독립 제품 축 승격`을 분리하고, public surface에는 행동 근거 helper만, raw 운영 진단은 trust hub owner로 남기는 원칙을 고정했습니다.
- `DART`는 public info primary / recommend secondary, `혜택`은 public info primary / planning secondary, `주거`는 public info primary / planning secondary, `환율`은 public info primary / planning secondary로 정리했습니다.
- `macro / retirement / insurance`는 `P3-3` tier와 충돌하지 않도록 `planning / recommend` host 후보 또는 trust hub candidate 유지 원칙을 다시 연결했습니다.
- 상태판에서 `P3-4`를 `[미착수]`에서 `[진행중]`으로 올리고, 완료 수는 늘지 않으므로 전체/Phase 3 진행률은 유지했습니다.

## 검증
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md analysis_docs/v2/10_support_layer_role_separation.md work/3/17/2026-03-17-p3-4-role-separation-definition.md`

## 남은 리스크
- 이번 라운드는 role matrix 정의까지만 닫았고, 실제 helper/CTA/copy 배치는 후속 구현 라운드에서 host surface별로 더 좁혀야 합니다.
- `DART`를 `recommend` secondary host로 둘 때 어떤 정도의 공시 helper까지 허용할지는 실제 구현 라운드에서 다시 범위를 좁혀야 합니다.
- `.data/*`, generated freshness/schema report, stale hold note 4개는 이번 라운드 범위 밖이라 그대로 남겨 두었습니다.
