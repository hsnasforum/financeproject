# 2026-03-16 analysis_docs 운영 정책

## 현재 상태
- 정책 정리 시점 기준 `analysis_docs/**`와 `work/3/16/2026-03-16-analysis-docs-*.md`는 Git 기준 untracked 상태였습니다.
- `work/3/16`에는 `analysis-docs-*` 메모가 다수 누적되어 있고, 같은 문서군을 다른 slug로 나눈 기록도 보입니다.
- 이번 라운드 시작 전 확인 기준은 최신 `/work`, `analysis_docs/README.md`, `git status --short -- analysis_docs work/3/16`, `work/3/16/*analysis-docs-*`, 최근 `analysis-docs-*` `/work` 기록입니다.
- 이번 closeout 배치는 운영 정책을 실행하는 라운드이며, rename, delete, merge와 범위 확장은 하지 않습니다.

## Git 추적 결정
- [실행] `analysis_docs/**`와 `work/3/16/2026-03-16-analysis-docs-*.md`를 이번 closeout 배치의 staging/commit 대상으로 확정합니다.
- 이유 1: `02_화면정의서`, `03_DTO_API_명세서`, `04_QA_명세서` 재검증이 끝나 기준 문서 성격이 커졌고, 이제는 diff와 이력 관리가 필요합니다.
- 이유 2: 현재처럼 untracked 상태면 일반 `git diff --check`가 실제 내용 변경보다 untracked 상태만 보여 주기 쉬워 검증 흐름이 불편합니다.
- 이유 3: README와 `/work` 정책 메모가 생긴 뒤에도 본문이 계속 untracked면 어떤 버전이 기준본인지 팀 단위로 합의하기 어렵습니다.
- 이유 4: 대표본/후속기록 규칙은 이미 문서화되어 있으므로, 이번에는 현 상태를 그대로 보존한 채 묶어 올리는 편이 안전합니다.
- [보류] 기존 `analysis-docs-*` 메모의 rename, delete, merge 판단은 별도 운영 라운드로 넘깁니다.
- [추가 결정 필요] 이후 라운드에서 중복 slug를 어떤 기준으로 정리할지는 별도 결정이 필요합니다.

## /work 대표본 규칙 추천안
- [권장안] 대표본 + 후속기록 병행 방식으로 운영합니다.
- 대표본은 하루에 하나의 운영 기준 문서만 둡니다. 운영 정책, 전체 상태, 남은 결정 사항처럼 다음 라운드가 바로 이어야 하는 내용은 대표본에 모읍니다.
- 후속기록은 문서별 재검증이나 주제별 보정처럼 독립 근거가 필요한 경우에만 새 파일을 만듭니다.
- 같은 날짜에 같은 주제의 상태만 갱신할 때는 대표본을 갱신하고, 새 파일 세트나 새 검증 범위가 생길 때만 후속기록을 추가합니다.
- 이번처럼 운영 기준을 정리하는 날의 대표본 파일명은 `2026-03-16-analysis-docs-ops-policy.md`처럼 `analysis-docs-ops-policy` slug를 고정합니다.
- 후속기록 slug는 `analysis-docs-<문서군>-<주제>-<행동>`으로 맞추고, 행동 어휘는 `review`, `recheck`, `followup`, `summary`, `policy` 정도로 제한합니다.
- 같은 뜻의 slug를 여러 개 만들지 않습니다. 예: `screen-definition`과 `screen-spec`처럼 겹치는 이름은 다음 라운드부터 하나로 고정합니다.
- 이번 라운드에서는 기존 메모 rename, delete, merge를 하지 않습니다. 대량 정리가 필요하면 별도 운영 라운드로 넘깁니다.

## 이번 라운드에서 실제 수정한 파일
- `analysis_docs/README.md`
- `work/3/16/2026-03-16-analysis-docs-ops-policy.md`

## 실행한 검증
- `git diff --check -- analysis_docs/README.md work/3/16/2026-03-16-analysis-docs-ops-policy.md` 실행 결과 출력 없음
- `git status --short -- analysis_docs work/3/16` 실행 결과 `analysis_docs/`와 관련 `analysis-docs-*` 메모들이 모두 `??` 상태로 남아 있어 이번 라운드에서 추적 전환을 하지 않았음을 재확인

## 남은 결정 사항
- [추가 결정 필요] 오늘 이미 쌓인 `analysis-docs-*` 메모를 다음 운영 라운드에서 유지, 참고, 보관 중 어떤 기준으로 분류할지
- [추가 결정 필요] `screen-definition`, `screen-spec`처럼 겹치는 slug를 이후 어떤 기준으로 정리할지

## Closeout 실행 메모
- 2026-03-16 closeout 라운드에서는 본 메모의 권장안에 따라 `analysis_docs/**`와 `work/3/16/2026-03-16-analysis-docs-*.md`를 보존 상태 그대로 Git 추적 대상으로 묶습니다.
- 이번 closeout에서는 `analysis_docs/README.md`와 이 메모만 최소 보정하고, 나머지 `analysis_docs` 본문과 후속 메모는 내용 수정 없이 유지합니다.
- 범위 밖 dirty 파일은 staging/commit에서 제외하고, rename/delete/merge는 수행하지 않습니다.

## 사용 skill
- `work-log-closeout`: `/work` 기록 형식과 남은 결정 사항을 저장소 관례에 맞춰 정리하는 용도
