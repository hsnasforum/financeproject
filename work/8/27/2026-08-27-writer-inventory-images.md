# 2026-08-27 Writer inventory 이미지 제작

## 변경 파일

- `resources/captures/2026-08-27/writer-inventory/IMAGE_01_writer_inventory_pr_head.png`
- `resources/captures/2026-08-27/writer-inventory/IMAGE_02_actions_same_pr_head.png`
- `resources/captures/2026-08-27/writer-inventory/IMAGE_03_root_relationship_diagram.png`
- `resources/captures/2026-08-27/writer-inventory/IMAGE_04_registry_vs_lease_diagram.png`
- `resources/captures/2026-08-27/writer-inventory/README.md`
- `work/8/27/2026-08-27-writer-inventory-images.md`

## 사용 skill

- `finance-skill-routing`: ops/docs 이미지 라운드에 필요한 최소 skill 조합을 선택했다.
- `planning-gate-selector`: docs/assets 전용 변경으로 분류하고 문서 diff와 이미지 QA를 최소 검증으로 정했다.
- `chrome:control-chrome`: 로그인된 실제 GitHub PR과 Actions 목록을 한 화면 조건 그대로 캡처했다.
- `imagegen`: 실제 화면과 혼동되지 않는 경로 관계 도식과 registry/lease 비교 개념도를 제작했다.
- `work-log-closeout`: 변경 파일, 실제 검증과 남은 게시 리스크를 표준 형식으로 기록했다.

## 변경 이유

- Draft PR #292의 writer inventory 수치와 동일 head의 Actions 성공 상태를 실제 화면으로 제시하고, registry·drift guard와 cross-process lease의 차이를 과장 없이 설명하기 위해서다.
- 저장소·계정·브랜치·전체 식별값 노출을 줄이고 358px 본문 폭에서 기존 전체 화면보다 판독하기 쉬운 재크롭본이 필요했다.

## 핵심 변경

- PR #292의 정확한 head `fd3a3620ffcb37bcda78560c20286fbf1f85eec5`에서 Draft, writer target 39개, audited writer source 63개, entrypoint 46개, unresolved source/target 0을 재확인했다.
- CI run `31945063822`와 E2E Smoke run `31945063824`가 같은 head에서 `completed/success`임을 API로 교차 확인하고 하나의 실제 Actions 목록 화면에서 캡처했다.
- 실제 화면 두 장은 합성 없이 재크롭했으며 계정명·아바타·브랜치·긴 식별값은 불투명 마스킹했다.
- 경로 계약 도식과 registry/lease 비교 개념도는 실제 실행 성공이나 lease 구현 완료를 암시하지 않도록 고지와 제외 조건을 포함했다.
- README에 alt, 캡션, 마스킹 범위, 사용 프롬프트와 발행 직전 재확인 항목을 기록했다.

## 검증

- `gh pr view 292 --repo hsnasforum/financeproject --json state,isDraft,headRefOid,headRefName,body,url,title,updatedAt`: PR은 `OPEN`, Draft, head `fd3a3620ffcb37bcda78560c20286fbf1f85eec5`; 수치 39·63·46과 unresolved 0/0을 확인했다.
- `gh api repos/hsnasforum/financeproject/actions/runs/31945063822 --jq '{id,name,display_title,event,status,conclusion,head_sha,run_number,html_url,created_at,updated_at,head_branch}'`: CI run은 동일 head에서 `completed/success`였다.
- `gh api repos/hsnasforum/financeproject/actions/runs/31945063824 --jq '{id,name,display_title,event,status,conclusion,head_sha,run_number,html_url,created_at,updated_at,head_branch}'`: E2E Smoke run은 동일 head에서 `completed/success`였다.
- Chrome 실제 화면과 저장된 네 PNG를 열어 Draft·수치·run 번호·상태·도식 문구·마스킹 범위를 육안 확인했다.
- 네 PNG를 358px 폭으로 축소 렌더링해 핵심 수치·run 번호·도식 표기의 판독 범위를 확인했다.
- `file resources/captures/2026-08-27/writer-inventory/*.png`: 네 파일 모두 RGB PNG이며 해상도는 820×570, 610×280, 1672×941, 1672×941이다.
- `sha256sum resources/captures/2026-08-27/writer-inventory/*.png`: 네 파일의 SHA-256을 기록하고 파일 무결성을 확인했다.
- System.Drawing `PropertyItems` 검사: GPS·촬영 위치·카메라·날짜 EXIF 항목은 없었다.
- `git diff --check -- resources/captures/2026-08-27/writer-inventory/README.md work/8/27/2026-08-27-writer-inventory-images.md`: PASS.
- `rg -n "[[:blank:]]+$" resources/captures/2026-08-27/writer-inventory/README.md work/8/27/2026-08-27-writer-inventory-images.md`: trailing whitespace 없음.
- 코드·HTML·실행 경로를 바꾸지 않은 docs/assets 전용 라운드라 `pnpm test`, `pnpm build`, `pnpm e2e:rc`는 실행하지 않았다.

## 남은 리스크

- PR 상태와 Actions 결과는 외부 상태이므로 발행 직전 Draft·head·run 상태를 다시 확인해야 한다.
- Actions 목록 화면에는 GitHub 내부 run ID 전체가 직접 보이지 않고 workflow run 번호 #1259·#421이 보인다. 전체 run ID는 캡션과 실제 링크에서 보완해야 한다.
- 358px 표시 폭에서 핵심 항목은 확인 가능하지만 원문 전체 문장은 작다. 티스토리 스킨의 클릭 확대와 실제 업로드 렌더링은 아직 확인하지 않았다.
- 후속 검수에서 기존 `IMAGE_03_root_relationship_diagram.png`는 `P/planningRoot`처럼 읽힐 수 있어 게시 제외됐다. 교정 결과는 `2026-08-27-writer-inventory-image03-correction.md`를 기준으로 한다.
