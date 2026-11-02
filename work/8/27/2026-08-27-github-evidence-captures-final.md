# 2026-08-27 GitHub 근거 이미지 최종 재캡처

## 변경 파일

- `resources/captures/2026-08-27/README.md`
- `resources/captures/2026-08-27/final/IMAGE_01A_release_v1.4.0_final.png`
- `resources/captures/2026-08-27/final/IMAGE_01B_pr_291_merged_final.png`
- `resources/captures/2026-08-27/final/IMAGE_02_adr_deployment_modes_final.png`
- `resources/captures/2026-08-27/final/IMAGE_03_next_prod_safe_loopback_final.png`
- `resources/captures/2026-08-27/final/IMAGE_04A_policy_modes_and_failure_codes_final.png`
- `resources/captures/2026-08-27/final/IMAGE_04B_policy_contract_tests_final.png`
- `resources/captures/2026-08-27/final/IMAGE_05_runtime_consumer_search_final.png`
- `resources/captures/2026-08-27/final/IMAGE_06A_actions_ci_31877599227_final.png`
- `resources/captures/2026-08-27/final/IMAGE_06B_actions_e2e_31877599268_final.png`
- `resources/captures/2026-08-27/final/IMAGE_07B_pr_292_scope_boundaries_final.png`
- `resources/captures/2026-08-27/final/README.md`
- `resources/captures/2026-08-27/final/mobile-preview.html`
- `resources/captures/2026-08-27/final/_qa_mobile_preview_390.png`
- `work/8/27/2026-08-27-github-evidence-captures-final.md`

## 사용 skill

- `browser:control-in-app-browser`: 비로그인 GitHub 접근성과 로컬 390px 콘텐츠 프레임을 확인했다.
- `chrome:control-chrome`: 인증된 GitHub Release, PR, 코드, Actions 화면을 실제로 재캡처하고 티스토리 초안의 현재 링크·이미지 수를 읽기 전용으로 확인했다.
- `finance-skill-routing`: 이번 verification/capture 라운드의 최소 skill 조합을 정했다.
- `planning-gate-selector`: 코드 변경이 없는 문서·캡처 작업으로 분류하고 이미지·링크·모바일 렌더 검증만 선택했다.
- `work-log-closeout`: 변경 파일, 실제 검증과 남은 게시 단계 위험을 표준 형식으로 기록했다.

## 변경 이유

- 기존 IMAGE_05가 본문 기준 main SHA가 아닌 PR #291 head를 검색한 화면이어서 사용할 수 없었다.
- 전체 화면 위주 원본은 390px 본문 폭에서 코드·문서 핵심 글자가 지나치게 작았다.
- 실제 링크 접근성, 이미지 업로드 URL, 대표 이미지와 티스토리 스킨 미리보기 상태를 분리해 기록할 필요가 있었다.

## 핵심 변경

- IMAGE_05를 `6a51f8d3a24394ba239838a78c8c19aa590fc180` 기준의 동일 `git grep` 범위로 다시 만들었다.
- 최종 사용본을 10장으로 정리하고 ADR·script·정책·테스트·Actions·PR 화면을 핵심 범위 중심으로 재캡처 또는 재크롭했다.
- 기존 IMAGE_05와 IMAGE_07A는 최종 사용본에서 제외하고 IMAGE_02를 대표 이미지로 지정했다.
- 모든 최종 이미지 확장자와 실제 형식을 PNG로 일치시키고, 링크·alt·캡션·기준 SHA를 최종 매니페스트에 기록했다.
- 티스토리 초안은 현재 링크 0개·이미지 0개임을 확인했으며 외부 업로드나 초안 수정은 수행하지 않았다.

## 검증

- `git rev-parse 6a51f8d3a24394ba239838a78c8c19aa590fc180`: 기준 commit 확인
- `git grep -n -F resolvePlanningDeploymentPolicy 6a51f8d3a24394ba239838a78c8c19aa590fc180 -- src scripts planning middleware.ts package.json`: 선언·정의 두 결과와 지정 범위 runtime consumer 미확인 재현
- `gh repo view hsnasforum/financeproject --json nameWithOwner,url,visibility,isPrivate`: 저장소가 `PRIVATE`임을 확인
- 인증된 Chrome에서 Release, PR #291·#292, ADR, script, policy, 테스트, Actions 두 run URL을 열어 화면과 상태를 확인
- 비로그인 in-app browser에서 저장소 GitHub URL이 404로 표시됨을 확인
- 티스토리 글쓰기 초안 DOM 확인: 링크 0개, 이미지 0개
- `file IMAGE_*_final.png`: 최종 10개가 실제 PNG이며 해상도가 비어 있지 않음을 확인
- `sha256sum IMAGE_*_final.png`: 최종 10개 해시 생성
- System.Drawing property 검사: 카메라·GPS EXIF 필드 없이 PNG 색상·크기 관련 metadata만 확인
- 로컬 HTTP preview: 최종 10개 이미지 요청이 모두 200, 390px 콘텐츠 프레임에서 이미지 폭 356px, body 가로 넘침 없음
- `view_image`: 최종 10개와 390px QA 캡처를 육안 확인
- 미실행: `pnpm test`, `pnpm build`, `pnpm e2e:rc`, Actions 재실행. 코드·runtime·본문 HTML을 변경하지 않았고 새 실행 결과처럼 보이는 증거를 만들지 않기 위해 실행하지 않았다.

## 남은 리스크

- 저장소가 private이므로 매니페스트의 GitHub URL은 인증된 사용자만 열 수 있다. 공개 블로그 독자용 실제 링크 요건은 충족하지 않는다.
- 티스토리 이미지 업로드 URL, 본문 링크 입력, IMAGE_02 대표 이미지 지정과 스킨 미리보기는 아직 수행하지 않았다.
- 390px 콘텐츠 프레임에서 여백은 줄었지만 긴 정책·테스트 소스의 세부 글자는 확대 또는 원본 링크가 필요하다. 티스토리 이미지 확대 동작은 업로드 후 별도 확인해야 한다.
- PR #292의 Draft 상태는 발행 직전에 다시 확인해야 한다.
