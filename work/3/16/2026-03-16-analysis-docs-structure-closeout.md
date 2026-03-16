# 2026-03-16 analysis_docs 구조 closeout

## 변경 파일
- `analysis_docs/00_실행요약.md` 삭제
- `analysis_docs/01_현행분석_및_개선기획서.md` 삭제
- `analysis_docs/02_화면정의서.md` 삭제
- `analysis_docs/03_DTO_API_명세서.md` 삭제
- `analysis_docs/04_QA_명세서.md` 삭제
- `analysis_docs/05_개선로드맵_백로그.md` 삭제
- `analysis_docs/README.md` 삭제
- `analysis_docs/v1/**`
- `analysis_docs/v2/**`
- `work/3/16/2026-03-16-analysis-docs-structure-closeout.md`

## 사용 skill
- `work-log-closeout`: 구조 closeout 범위, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 현재 worktree에는 기존 루트 `analysis_docs/*` 삭제와 새 `analysis_docs/v1/**`, `analysis_docs/v2/**` untracked가 함께 있어 Git 기준 구조 변경 의도가 분명하게 남지 않는 상태였습니다.
- 이번 라운드는 문서 내용 재작성 없이, 기존 정적 분석 세트를 `v1` 기준선으로 보존하고 실행 추적 세트를 `v2`로 분리한 구조를 정식 closeout 하는 것이 목적입니다.

## 핵심 변경
- 기존 루트 문서 7개와 `analysis_docs/v1/*` 대응을 확인했고, 모두 1:1 동일 본문으로 매칭됐습니다.
- 대응 관계는 `00_실행요약`부터 `05_개선로드맵_백로그`, `README.md`까지 전부 `루트 -> v1` 동일 파일명 기준입니다.
- `analysis_docs/README.md`의 역할은 `analysis_docs/v1/README.md`로 이어지고, `analysis_docs/v2/README.md`는 여기에 v2 실행 추적 규칙을 추가한 별도 운영 기준입니다.
- `analysis_docs/v2/**`는 v1 기본 세트 위에 `financeproject_next_stage_plan.md`를 더한 실행 추적 세트로 정리합니다.
- staged 검증에서 걸린 `analysis_docs/v2/00~05`의 trailing whitespace는 의미 변경 없이 whitespace-only로 정리했습니다.
- Windows 다운로드 메타파일 `analysis_docs/v2/financeproject_next_stage_plan.md:Zone.Identifier`는 문서 본문이 아닌 부가 흔적이라 commit 범위에서 제외했습니다.
- 실제 staging/commit 범위는 루트 `analysis_docs/*` 삭제, `analysis_docs/v1/**`, `analysis_docs/v2/**`, 그리고 이번 closeout note 1개로 제한합니다.

## 구조 대응
- `analysis_docs/00_실행요약.md` -> `analysis_docs/v1/00_실행요약.md`
- `analysis_docs/01_현행분석_및_개선기획서.md` -> `analysis_docs/v1/01_현행분석_및_개선기획서.md`
- `analysis_docs/02_화면정의서.md` -> `analysis_docs/v1/02_화면정의서.md`
- `analysis_docs/03_DTO_API_명세서.md` -> `analysis_docs/v1/03_DTO_API_명세서.md`
- `analysis_docs/04_QA_명세서.md` -> `analysis_docs/v1/04_QA_명세서.md`
- `analysis_docs/05_개선로드맵_백로그.md` -> `analysis_docs/v1/05_개선로드맵_백로그.md`
- `analysis_docs/README.md` -> `analysis_docs/v1/README.md`
- `analysis_docs/v2/**` -> v1 세트 기반 + `financeproject_next_stage_plan.md` + v2 실행 추적 규칙

## 검증
- `git status --short`
- `find analysis_docs -maxdepth 2 -type f | sort`
- `git ls-files analysis_docs | sort`
- `for f in "analysis_docs/00_실행요약.md" "analysis_docs/01_현행분석_및_개선기획서.md" "analysis_docs/02_화면정의서.md" "analysis_docs/03_DTO_API_명세서.md" "analysis_docs/04_QA_명세서.md" "analysis_docs/05_개선로드맵_백로그.md" "analysis_docs/README.md"; do base=$(basename "$f"); if git show HEAD:"$f" | cmp -s - "analysis_docs/v1/$base"; then echo "MATCH $f -> analysis_docs/v1/$base"; else echo "DIFF  $f -> analysis_docs/v1/$base"; fi; done`
- `file analysis_docs/v2/financeproject_next_stage_plan.md:Zone.Identifier`
- `git diff --check -- analysis_docs work/3/16/2026-03-16-analysis-docs-structure-closeout.md`
- `git diff --cached --name-only`
- `git diff --check --cached -- analysis_docs work/3/16`
- `git status --short`

## 남은 리스크
- Git이 최종 표시에서 일부 파일을 `rename`이 아닌 `delete + add`로 보일 수 있습니다. 이번 라운드에서는 `/work`에 구조 변경 의도를 명시해 closeout 의미를 보강했습니다.
- 오늘 생성된 다른 `analysis_docs` 관련 `/work` 메모들은 이번 커밋 범위에 넣지 않았기 때문에 계속 untracked로 남습니다.
- `analysis_docs/v2/financeproject_next_stage_plan.md`의 상태판은 앞으로도 실제 실행 배치마다 문서와 `/work`를 같이 갱신해야 어긋나지 않습니다.

## 다음 우선순위
- `P1-1` e2e 후속 triage 결과를 기준으로 selector/copy drift 배치를 별도로 열지 결정
- `P2-1` canonical planning-to-recommend contract 선행 결정을 좁혀 다음 실행 배치 범위를 확정
