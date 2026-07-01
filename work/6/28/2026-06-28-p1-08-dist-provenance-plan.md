# 2026-06-28 P1-08 dist provenance plan

## 변경 파일
- 없음. 이번 라운드는 구현 없이 `.dist`/desktop artifact provenance baseline 조사와 실행 분해만 수행했습니다.

## 사용 skill
- `finance-skill-routing`: 오늘 최신 `/work`와 이번 라운드 성격을 기준으로 필요한 skill 범위를 최소화했습니다.
- `planning-gate-selector`: desktop artifact, installer, release/CI 경로에 필요한 검증 후보와 최종 gate 범위를 분류했습니다.
- `work-log-closeout`: `/work` 기록 형식과 필수 섹션을 저장소 규칙에 맞춰 정리했습니다.

## 변경 이유
- P1-08은 `.dist`를 source SSOT에서 제거하고 desktop artifact provenance를 강제하는 독립 PR 단위라서, 구현 전에 실제 tracked artifact 상태와 installer/release topology를 확인해야 했습니다.
- 현재 저장소에는 `.dist/planning-v2-desktop*`가 Git tracked 상태로 남아 있고, desktop manifest/package version도 루트 package version과 어긋나 있어 baseline 실패를 먼저 고정해야 합니다.

## 직접 변경
- 최신 `/work` 기준점으로 `work/6/28/2026-06-28-p1-07-public-api-provenance.md`와 `work/6/28/2026-06-28-p1-07-provenance-plan.md`를 확인했습니다.
- `.gitignore`, `package.json`, `docs/planning-v2-desktop-local.md`, `scripts/planning_v2_desktop_build.mjs`, `scripts/planning_v2_desktop_install.mjs`, `scripts/planning_v2_desktop_smoke.mjs`, `scripts/release_verify.mjs`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`를 읽어 desktop artifact topology를 확인했습니다.
- `.dist/planning-v2-desktop/desktop-manifest.json`, `.dist/planning-v2-desktop/package.json`, `.dist/planning-v2-desktop-installed/desktop-manifest.json`, `.dist/planning-v2-desktop-installed/package.json`에서 committed desktop manifest/package version이 `1.0.1`이고 루트 `package.json` version이 `1.0.4`인 점을 확인했습니다.
- `tests/desktop-artifact-provenance.test.ts` baseline을 실행해 `.dist tracked`, `manifest provenance 누락`, `installer provenance 미검증` 3건이 모두 현재 실패함을 확인했습니다.

## 검증
- `rg --files work | sort`
- `Get-Content .codex/skills/finance-skill-routing/SKILL.md`
- `Get-Content .codex/skills/planning-gate-selector/SKILL.md`
- `Get-Content .codex/skills/work-log-closeout/SKILL.md`
- `Get-Content multi_agent.md`
- `Get-ChildItem -Path work/6/28 -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name,LastWriteTime`
- `Get-Content work/6/28/2026-06-28-p1-07-provenance-plan.md`
- `Get-Content work/6/28/2026-06-28-p1-07-public-api-provenance.md`
- `git ls-files .dist "*planning-v2-desktop*" "*desktop*manifest*"`
- `Get-Content .dist/planning-v2-desktop/desktop-manifest.json`
- `Get-Content .dist/planning-v2-desktop/package.json`
- `Get-Content .dist/planning-v2-desktop-installed/desktop-manifest.json`
- `Get-Content .dist/planning-v2-desktop-installed/package.json`
- `Get-Content .gitignore`
- `Get-Content package.json`
- `Get-Content scripts/planning_v2_desktop_build.mjs`
- `Get-Content scripts/planning_v2_desktop_install.mjs`
- `Get-Content scripts/planning_v2_desktop_smoke.mjs`
- `Get-Content scripts/planning_v2_release.mjs`
- `Get-Content scripts/release_verify.mjs`
- `Get-Content docs/planning-v2-desktop-local.md`
- `Get-Content .github/workflows/ci.yml`
- `Get-Content .github/workflows/release.yml`
- `Get-Content tests/desktop-artifact-provenance.test.ts`
- `git ls-files .dist | Measure-Object | Select-Object Count`
- `git status --short -- .dist`
- `corepack pnpm test tests/desktop-artifact-provenance.test.ts`
  - Windows UNC 작업 경로 제약으로 실패. 저장소 baseline과 무관한 실행 환경 문제로 분리했습니다.
- `wsl bash -lc 'cd /home/xpdlqj/code/finance && corepack pnpm test tests/desktop-artifact-provenance.test.ts'`
  - FAIL. 3개 테스트 모두 실패:
  - `.dist` tracked source 제거 기대 실패
  - generated manifest provenance 필드(`gitSha`, `lockfileSha256`, `artifactChecksum`) 누락
  - installer가 provenance manifest 없는 입력을 거부하지 않음

## 남은 리스크
- `.dist` 아래 tracked 파일이 2177개라서 삭제/ignore만으로 끝나지 않고 release/installer/docs가 새 artifact 생성 경로를 명시적으로 가리키도록 같이 좁혀야 합니다.
- 현재 `planning_v2_desktop_build.mjs`는 version/builtAt만 기록하고, `planning_v2_desktop_install.mjs`는 manifest 검증 없이 복사하므로 stale artifact 설치를 막지 못합니다.
- CI는 `pnpm release:verify`와 `pnpm build`만 수행하고 desktop artifact build/install/smoke를 실행하지 않으며, tag release workflow도 GitHub Release 생성만 수행합니다.
- 최종 gate에서는 clean checkout 기준 `pnpm cleanup:next-artifacts -- --build-preflight`, `pnpm build`, desktop artifact build/install/smoke, tracked diff 확인을 메인 단일 소유자로 순차 실행해야 합니다.
