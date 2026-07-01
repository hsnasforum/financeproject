# 2026-06-28 P1-08 desktop artifact provenance

## 변경 파일
- `.dist/**`: Git index에서 제거. 작업 디렉터리 생성물은 유지하되 source SSOT에서는 제외.
- `.gitignore`, `tsconfig.json`: `/.dist/`, `.dist/**` 제외 규칙 추가.
- `scripts/planning_v2_desktop_build.mjs`, `scripts/planning_v2_desktop_install.mjs`, `scripts/planning_v2_desktop_provenance.mjs`, `scripts/planning_v2_desktop_smoke.mjs`: manifest provenance 생성/검증, stale artifact 차단, desktop smoke local single-user env 보정.
- `.github/workflows/ci.yml`, `.github/workflows/release.yml`: CI desktop artifact provenance gate와 release artifact inventory 첨부 추가.
- `docs/planning-v2-desktop-local.md`: `.dist` 생성물 성격과 installer provenance 검증 안내 추가.
- `tests/desktop-artifact-provenance.test.ts`: `.dist` 추적 제거, manifest provenance, manifest 누락, checksum 변조 regression 추가.

## 사용 skill
- `planning-gate-selector`: desktop artifact 변경의 targeted test, build, smoke, lint/typecheck 범위 선정에 사용.
- `work-log-closeout`: `/work` 종료 기록 형식과 필수 섹션 확인에 사용.

## 변경 이유
- `.dist/planning-v2-desktop*` 2177개 파일이 Git tracked source처럼 남아 있었고 committed desktop manifest/package version은 `1.0.1`, 루트 package version은 `1.0.4`로 불일치했습니다.
- installer가 manifest/provenance 검증 없이 입력 디렉터리를 복사해 오래되었거나 변조된 desktop artifact 설치를 막지 못했습니다.
- release workflow가 desktop artifact를 clean checkout에서 생성하거나 inventory를 남기지 않았습니다.

## 핵심 변경
- `git ls-files '.dist/**'` 결과가 0이 되도록 `.dist` tracked artifact를 index에서 제거하고 ignore/exclude 규칙을 추가했습니다.
- build manifest에 `provenanceVersion`, `packageVersion`, `gitSha`, `lockfileSha256`, `artifactChecksum`을 기록하도록 했습니다.
- installer가 복사 전에 manifest kind/version/git SHA/lockfile/checksum/fileCount/totalBytes를 검증하며, manifest 누락 또는 checksum 변조 시 설치 경로를 만들기 전에 실패하도록 했습니다.
- CI는 기존 `pnpm build` 후 `planning:v2:desktop:build -- --no-next-build`와 `planning:v2:desktop:install -- --skip-install`로 clean checkout provenance gate를 수행합니다.
- release는 desktop artifact tarball과 `*.inventory.txt`를 함께 생성해 GitHub Release에 첨부합니다.
- desktop smoke는 child process에만 `PLANNING_AUTH_REQUIRED=false`, `PLANNING_SINGLE_USER_MODE=true`, packaged runtime 기본값을 주입해 로컬 desktop single-user 흐름을 검증합니다.

## 검증
- 수정 전 `corepack pnpm test tests/desktop-artifact-provenance.test.ts` FAIL: `.dist` tracked, manifest provenance 누락, installer manifest 누락 허용 3건 재현.
- `node --check scripts/planning_v2_desktop_provenance.mjs` PASS.
- `node --check scripts/planning_v2_desktop_build.mjs` PASS.
- `node --check scripts/planning_v2_desktop_install.mjs` PASS.
- `node --check scripts/planning_v2_desktop_smoke.mjs` PASS.
- `git ls-files '.dist/**' | wc -l` PASS: `0`.
- `corepack pnpm test tests/desktop-artifact-provenance.test.ts` PASS: 4 tests.
- `corepack pnpm planning:v2:desktop:build` PASS: 내부 `pnpm build` 포함.
- manifest 확인 PASS: `version=1.0.4`, `gitSha`는 실행 당시 HEAD와 일치, `lockfileSha256=c2763552593aabbcd3c944f93cc25b1f641b4240349482091bb5c13a44d823f7`, `fileCount=26856`.
- `corepack pnpm planning:v2:desktop:build -- --no-next-build` PASS.
- `corepack pnpm planning:v2:desktop:install -- --skip-install --from=.dist/planning-v2-desktop --to=tmp/p1-08-desktop-install` PASS.
- `corepack pnpm planning:v2:desktop:smoke -- --app-dir=tmp/p1-08-desktop-install --port=3218 --timeout-ms=180000` PASS.
- `PLANNING_SINGLE_USER_MODE=true PLANNING_PACKAGED_MODE=1 PLANNING_RUNTIME_MODE=packaged corepack pnpm planning:v2:prod:smoke -- --app-dir=tmp/p1-08-desktop-install --port=3220 --timeout-ms=180000` FAIL: standalone 기동, `/public/dart`, static/public asset은 통과했으나 `/settings/data-sources`에서 기대 문구가 없어 실패.
- `corepack pnpm typecheck` PASS.
- `corepack pnpm lint` PASS.
- `git diff --check` PASS.

## 남은 리스크
- 현재 build manifest의 `gitSha`는 HEAD 기준입니다. dirty worktree에서 local build를 만들면 artifact checksum은 맞지만 manifest SHA는 마지막 commit을 가리키므로, release/CI는 clean checkout에서만 최종 배포 artifact를 생성해야 합니다.
- `planning:v2:prod:smoke`는 desktop artifact standalone 자체는 띄웠지만 `/settings/data-sources`의 production/auth 전제와 맞지 않아 전체 PASS가 아닙니다. P1-08 필수 acceptance는 `planning:v2:desktop:smoke`로 통과했으며, production smoke 계약 조정은 후속 이슈로 분리하는 것이 안전합니다.
- migration, rollback 대상 데이터, quarantine 대상 legacy 데이터는 없습니다. 이번 변경의 rollback은 commit revert 또는 `.dist` tracking 제거 보류 후 installer 검증만 유지하는 방식입니다.
