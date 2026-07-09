# 2026-07-01 우선순위 12개 이슈 배치 계획

## 변경 파일
- `work/7/1/2026-07-01-priority-issue-batch-plan.md`

## 사용 skill
- `planning-gate-selector`: 우선순위 묶음별 최소 검증 세트와 최종 게이트 소유권을 정리하는 데 사용했습니다.
- `work-log-closeout`: 오늘 `/work` 종료 기록 형식과 필수 항목을 맞추는 데 사용했습니다.

## 변경 이유
- 사용자가 제공한 통합 Markdown의 우선순위 12개 이슈를 GitHub 등록용 단위와 구현 배치 단위로 다시 묶을 필요가 있었습니다.
- 원본 조사 Markdown 없이 통합 Markdown만 근거로 쓰기로 했으므로, 구현 전 저장소 코드 확인이 필수라는 전제를 계획에 반영해야 했습니다.
- 최종 `pnpm build`, `pnpm e2e:rc`, PASS/FAIL 판정은 메인 에이전트만 수행하도록 작업 분담 기준을 먼저 고정해야 했습니다.

## 단계 변경
- 1단계는 GitHub 이슈 등록 기준 정리와 코드 현황 대조로 시작합니다. 통합 Markdown 문구를 바로 구현 가정으로 쓰지 않고 실제 경로, API, 컨트롤러, 스토어를 먼저 확인합니다.
- 2단계는 우선순위 1~6의 Planning/FINLIFE 구조 리스크를 먼저 처리하는 배치입니다. API canonical 경로, auth/user scope, run store, create-run orchestration, workspace controller 분리를 한 묶음으로 다룹니다.
- 3단계는 우선순위 7~9의 사용자 표면 정리 배치입니다. landing/dashboard 역할, recommend/product controller 분리, benefits/gov24 흐름 통합을 다룹니다.
- 4단계는 우선순위 10~12의 노출 정책과 운영 경계 정리 배치입니다. public API error vs ops diagnostic, navigation/route registry, product catalog/category/samplebank 정책을 정리합니다.
- 각 배치 종료 시 문서와 `/work`를 갱신하고, 최종 게이트는 메인 에이전트가 단독 실행합니다.

## 검증
- 실행한 확인
  - `Get-ChildItem -Path work -Recurse -File -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 10 FullName,LastWriteTime`
  - `Get-Content work/6/30/2026-06-30-local-complete-final-report.md -TotalCount 220`
  - `Get-Content work/6/30/2026-06-30-local-gate-refresh.md -TotalCount 220`
  - `Get-Content multi_agent.md -TotalCount 220`
  - `rg --files src | rg "planning|recommend|product|benefit|gov24|navigation|route|landing|dashboard|catalog|samplebank|finlife|gateway|public-api|ops|diagnostic"`
  - `Get-Content docs/current-screens.md -TotalCount 260`
  - `rg -n "create-issue|github issue|GitHub issue|planningFeedbackIssue|issue template|labels" src docs scripts .github`
  - `Get-Content package.json -TotalCount 260`
  - `git status --short --branch`
- 미실행 검증
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm e2e:rc`
  - `pnpm planning:v2:complete`
  - `pnpm planning:v2:compat`
  - `pnpm planning:current-screens:guard`
  - `pnpm planning:ssot:check`
  - `pnpm planning:auth:check`
  - `pnpm planning:user-scope:check`

## 남은 리스크
- 오늘 라운드는 계획 수립만 했고 구현 검증은 수행하지 않았습니다. 따라서 각 이슈의 실제 난이도와 충돌 범위는 코드 확인 후 조정될 수 있습니다.
- 현재 working tree가 이미 dirty 상태이므로, 새 배치 구현 전에는 기존 수정분과 파일 충돌 여부를 먼저 분리해야 합니다.
- `docs/current-screens.md`와 실제 route/API 노출 정책 사이에 이미 누적된 차이가 있을 수 있습니다. route 정리 배치는 SSOT 검증을 반드시 동반해야 합니다.
