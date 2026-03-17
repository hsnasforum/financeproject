# 2026-03-16 analysis_docs 구조 closeout follow-up

## 변경 파일
- `work/3/16/2026-03-16-analysis-docs-structure-closeout-followup.md`

## 사용 skill
- `work-log-closeout`: 구조 closeout의 실제 Git 상태, 검증, 남은 우선순위를 `/work` 형식으로 남기는 데 사용.

## 변경 이유
- 사용자 요청은 기존 루트 `analysis_docs/*` 삭제와 `analysis_docs/v1/**`, `analysis_docs/v2/**` untracked를 Git 기준으로 닫는 구조 closeout이었습니다.
- 실제 저장소 상태를 확인해 보니, 구조 개편 자체는 이미 `9c7e33f docs(analysis): reorganize analysis docs into v1 and v2 sets`에서 반영되어 있었고, 이번 라운드에서는 그 사실을 재검증하고 handoff를 남기는 편이 맞았습니다.

## 핵심 변경
- `HEAD`에는 이미 루트 `analysis_docs/*`가 없고 `analysis_docs/v1/**`, `analysis_docs/v2/**`만 추적되고 있음을 확인했습니다.
- 기존 루트 문서 7종은 `analysis_docs/v1/*` 7종과 해시 기준으로 1:1 일치해, `v1`이 기존 tracked 세트의 계승본임을 재확인했습니다.
- `analysis_docs/v2/*` 7종은 같은 제목 문서의 후속 세트이고, `analysis_docs/v2/financeproject_next_stage_plan.md`가 추가된 실행 추적 세트임을 재확인했습니다.
- 기존 `analysis_docs/README.md`의 본문 해시는 `analysis_docs/v1/README.md`와 동일하고, `analysis_docs/v2/README.md`는 실행 추적 규칙이 추가된 분기 README 역할입니다.
- 이번 라운드의 실제 staging/commit 범위는 새 `/work` note 1건으로 축소했습니다. 이유는 `analysis_docs` 구조 diff 자체가 현재 worktree에 남아 있지 않기 때문입니다.

## 검증
- `git status --short`
- `find analysis_docs -maxdepth 2 -type f | sort`
- `git -c core.quotePath=false ls-files analysis_docs`
- `while IFS= read -r f; do b=$(basename "$f"); target="analysis_docs/v1/$b"; if [ -f "$target" ]; then old=$(git show HEAD:"$f" | sha256sum | cut -d' ' -f1); new=$(sha256sum "$target" | cut -d' ' -f1); if [ "$old" = "$new" ]; then echo "MATCH $f -> $target"; else echo "DIFF  $f -> $target"; fi; else echo "MISS  $f -> $target"; fi; done < <(git -c core.quotePath=false ls-files analysis_docs)`
- `while IFS= read -r f; do b=$(basename "$f"); target="analysis_docs/v2/$b"; if [ -f "$target" ]; then old=$(git show HEAD:"$f" | sha256sum | cut -d' ' -f1); new=$(sha256sum "$target" | cut -d' ' -f1); if [ "$old" = "$new" ]; then echo "MATCH $f -> $target"; else echo "DIFF  $f -> $target"; fi; else echo "MISS  $f -> $target"; fi; done < <(git -c core.quotePath=false ls-files analysis_docs)`
- `git show HEAD:analysis_docs/README.md | sha256sum && sha256sum analysis_docs/v1/README.md analysis_docs/v2/README.md`
- `git log --oneline -- analysis_docs | sed -n '1,20p'`
- `git ls-tree --name-only -r HEAD analysis_docs | sed -n '1,40p'`
- `git show --stat --oneline --summary HEAD -- analysis_docs work/3/16 | sed -n '1,80p'`
- `git diff --check -- analysis_docs work/3/16/2026-03-16-analysis-docs-structure-closeout-followup.md`
- `git diff --cached --name-only`
- `git diff --check --cached -- analysis_docs work/3/16`
- `git status --short`

## 남은 리스크
- 사용자 기준선과 실제 저장소 상태가 어긋나 있었기 때문에, 다음 라운드에서도 먼저 `git log -- analysis_docs`로 이미 닫힌 배치인지 재확인하는 편이 안전합니다.
- `analysis_docs/v2/**`는 실행 추적이 계속 이어질 수 있으므로, 이후 변경은 구조 배치가 아니라 상태판/`/work` 동기화 배치로 다뤄야 합니다.
- 오늘 생성된 `analysis_docs` 관련 다른 `/work` 메모들은 여전히 untracked라, 별도 운영 라운드에서 추적 자산으로 올릴지 결정이 필요합니다.

## 다음 우선순위
- `P1-1` e2e 후속 triage 배치 분리
- `P2-1` planning-to-recommend contract 선행 결정
