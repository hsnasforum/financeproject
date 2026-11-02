# 2026-08-27 GitHub 근거 화면 캡처

## 변경 파일

- `resources/captures/2026-08-27/IMAGE_01A_release_v1.4.0.jpg`
- `resources/captures/2026-08-27/IMAGE_01B_pr_291_merged.jpg`
- `resources/captures/2026-08-27/IMAGE_02_adr_deployment_modes.jpg`
- `resources/captures/2026-08-27/IMAGE_03_next_prod_safe_loopback.jpg`
- `resources/captures/2026-08-27/IMAGE_04A_policy_modes_and_failure_codes.jpg`
- `resources/captures/2026-08-27/IMAGE_04B_policy_contract_tests.jpg`
- `resources/captures/2026-08-27/IMAGE_05_runtime_consumer_search.png`
- `resources/captures/2026-08-27/IMAGE_06A_actions_ci_31877599227.jpg`
- `resources/captures/2026-08-27/IMAGE_06B_actions_e2e_31877599268.jpg`
- `resources/captures/2026-08-27/IMAGE_07A_pr_292_draft_header.jpg`
- `resources/captures/2026-08-27/IMAGE_07B_pr_292_scope_boundaries.jpg`
- `resources/captures/2026-08-27/README.md`
- `work/8/27/2026-08-27-github-evidence-captures.md`

## 사용 skill

- `browser:control-in-app-browser`: 대상 URL의 접근 가능 여부와 화면 캡처 절차를 확인했다.
- `chrome:control-chrome`: 접근 권한이 있는 Chrome 세션에서 실제 GitHub Release, PR, 코드, Actions 화면을 캡처했다.
- `finance-skill-routing`: 캡처 라운드에 필요한 최소 로컬 skill 조합을 선택했다.
- `planning-gate-selector`: 코드 변경이 없는 audit/capture 라운드로 분류하고 이미지 무결성·시각 검수를 선택했다.
- `work-log-closeout`: 생성 파일, 실제 확인 명령, 미실행 검증과 잔여 위험을 표준 형식으로 기록했다.

## 변경 이유

- 공개 Release, PR, ADR, 코드, 검색 결과와 Actions 기록의 시간 순서와 한계를 글에 실제 화면 근거로 제시하기 위해 캡처했다.
- 로그인 전역 계정·알림 영역, 비공개 저장소 목록과 로컬 절대 경로는 최종 이미지에서 제외했다.

## 핵심 변경

- IMAGE_01~07을 실제 GitHub 화면과 기준 SHA의 코드 화면으로 저장했다. 한 화면에 담기 어려운 IMAGE_01, IMAGE_04, IMAGE_06, IMAGE_07은 연속 배치용 하위 이미지로 분리했다.
- 정책·ADR·코드·검색 기준은 PR #291 head `359b3fe850fae3a93ded25ad9a7f3ed35a386af6`로 통일했다.
- Release published 시각·target SHA, PR merge 시각, Actions raw run ID·head SHA는 캡처 매니페스트에 정확히 보존했다.
- IMAGE_05는 실제 read-only `git rev-parse`·`git grep` 출력만 terminal-style 프레임에 렌더링했다.
- PR #292는 2026-08-27 KST 현재 Draft 상태와 `Scope boundaries`의 미구현 목록을 함께 캡처했다.

## 검증

- `gh release view v1.4.0 --repo hsnasforum/financeproject --json tagName,publishedAt,targetCommitish,url,name,isDraft,isPrerelease`: Release published 시각과 target 확인
- `gh api repos/hsnasforum/financeproject/git/ref/tags/v1.4.0` 및 annotated tag 조회: peeled target `ede8e48dac67ce691cdc82dee81572402543ff5d` 확인
- `gh pr view 291 --repo hsnasforum/financeproject --json ...` 및 `gh pr view 292 --repo hsnasforum/financeproject --json ...`: merge/Draft/head/body 확인
- `gh api repos/hsnasforum/financeproject/actions/runs/31877599227` 및 `31877599268`, jobs 조회: conclusion·head SHA·job 상태 확인
- `git show 359b3fe850fae3a93ded25ad9a7f3ed35a386af6:<path>`: ADR, script, policy, 계약 테스트 원문 확인
- `git grep -n -F resolvePlanningDeploymentPolicy 359b3fe850fae3a93ded25ad9a7f3ed35a386af6 -- src scripts planning middleware.ts package.json`: 선언·정의 외 runtime consumer 미확인
- `file`·`sha256sum`: 11개 이미지 형식, 해상도, 비어 있지 않은 파일과 해시 생성 확인
- 로컬 `view_image`: 11개 이미지의 기준 SHA·경로·상태·핵심 줄과 계정/알림 전역 영역 제외 여부를 육안 확인
- 미실행 검증: `pnpm test`, `pnpm build`, workflow rerun. 코드·runtime 변경이 없고 새 실행 결과처럼 보이는 화면을 만들지 않기 위해 실행하지 않았다.

## 남은 리스크

- GitHub UI는 최근 날짜를 상대 시간으로 표시하므로 Release/PR 정확한 ISO·KST 시각은 캡처 매니페스트의 확인값을 함께 사용해야 한다.
- Actions 본문은 raw run ID와 head SHA 대신 UI run sequence를 표시한다. raw ID·head SHA는 파일명, URL, 매니페스트에 보존했다.
- PR #292 상태는 발행 전 바뀔 수 있으므로 발행 직전 Draft badge와 본문 `Scope boundaries`를 다시 대조해야 한다.
- IMAGE_05는 실제 명령 출력을 충실히 렌더링한 이미지이며 OS terminal window 자체를 캡처한 것은 아니다.
