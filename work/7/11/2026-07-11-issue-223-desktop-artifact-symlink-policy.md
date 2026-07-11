# 2026-07-11 Issue #223 데스크톱 산출물 symlink provenance 정책

## 변경 파일

- `scripts/planning_v2_desktop_build.mjs`
- `scripts/planning_v2_desktop_provenance.mjs`
- `tests/desktop-artifact-provenance.test.ts`
- `work/7/11/2026-07-11-issue-223-desktop-artifact-symlink-policy.md`

## 사용 skill

- `planning-gate-selector`: desktop build/install script 변경에 필요한 focused test, production E2E, install/start, full test, lint, build, verify 범위를 선택했습니다.
- `work-log-closeout`: baseline, reviewer finding, 실제 artifact 계약과 잔여 플랫폼 리스크를 표준 종료 기록으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/223
- 기준 main: `0a393eb50f191c5b03fbcda1ef77c4070df0456f`
- 작업 브랜치: `codex/223-artifact-symlink-policy`
- 최신 clean build의 `.next/standalone`에는 tracked audit alias 두 개가 상대 symlink로 남았고, desktop artifact 복사 후에는 worktree 절대 symlink로 바뀌었습니다.
- 두 entry는 기존 checksum/fileCount에서 조용히 제외됐으며, 그중 transaction component alias target은 standalone 안에서 이미 dangling이었습니다.
- manifest schema와 hash 계산식을 바꾸지 않고 source-only alias만 제거한 뒤, 유효 artifact에는 symlink 자체를 허용하지 않는 정책으로 좁혔습니다.

## 핵심 변경

- Next tracing이 옮기는 source-only audit alias 두 경로를 artifact standalone 사본에서만 제거합니다. source `.next/standalone`은 변경하지 않습니다.
- checksum walker가 모든 symlink entry를 artifact-relative 경로가 포함된 오류로 거부합니다.
- `desktop-manifest.json` symlink도 manifest 제외보다 먼저 검사해 외부 manifest 우회를 막습니다.
- fixture가 두 audit alias, runtime static/public/prisma/package link 정규화, source link 보존을 함께 검증합니다.
- installer가 내부 directory junction을 추가한 변조 artifact와 일반 content mutation을 모두 거부하는지 확인합니다.
- public URL/API/응답 shape, manifest schema와 sha256 집계식, DB schema, Prisma query semantics, cache/revalidation은 변경하지 않았습니다.

## 검증

- baseline `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- baseline source standalone symlink: 2개 relative link 확인
- baseline artifact build: PASS, 같은 2개가 worktree absolute link로 복사되고 checksum 집계에서 제외되는 현상 재현
- `node --check scripts/planning_v2_desktop_build.mjs`: PASS
- `node --check scripts/planning_v2_desktop_provenance.mjs`: PASS
- `corepack pnpm eslint scripts/planning_v2_desktop_build.mjs scripts/planning_v2_desktop_provenance.mjs tests/desktop-artifact-provenance.test.ts`: PASS
- 초기 `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/desktop-artifact-provenance.test.ts tests/runtime/standalone-runtime-assets.test.ts --reporter=dot`: PASS, 2 files / 6 tests
- reviewer 보강 후 같은 focused command: PASS, 2 files / 7 tests
- clean artifact와 production E2E 이후 artifact: symlink 0개
- final clean/E2E-mutated manifest 비교: PASS, checksum `819bf5d6eb71754e2acef7671663c1b723457c4d2e08183f1c17096cc2d1bcca`, fileCount `3707`, totalBytes `146581498` 모두 동일
- production Playwright dashboard subset: PASS, 1 test
- `node scripts/planning_v2_desktop_install.mjs --skip-install --from=/tmp/finance-desktop-artifact-223-clean --to=/tmp/finance-desktop-installed-223`: PASS, checksum과 3,671 files 검증
- 설치 전 launcher smoke: FAIL, `--skip-install` 조건에서 의존성 미설치로 `next` module 부재 확인
- 설치본 `corepack pnpm install --frozen-lockfile`: PASS, 522 packages와 Prisma client 생성
- 의존성 설치 후 packaged production launcher `/planning`: PASS, HTTP 200
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `corepack pnpm lint`: PASS
- 최종 `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 static pages
- reviewer 보강 전 `DATABASE_URL=file:./prisma/dev.db corepack pnpm verify`: PASS; dump fixture, reports, security, lint, typecheck, full Vitest 완료
- reviewer P1 재현 감사 `DATABASE_URL=file:./prisma/dev.db node scripts/planning_v2_desktop_build.mjs --with-next-build --artifact-dir=/tmp/finance-desktop-artifact-223-with-build`: PASS, 250 pages와 artifact 생성
- 위 default builder artifact 및 production E2E 후 artifact: symlink 0개, checksum/fileCount/totalBytes 동일
- reviewer P2 manifest symlink 우회는 검사 순서를 수정했고 focused 7 tests로 재검증했습니다.
- reviewer P3 fixture 공백은 두 alias와 POSIX file symlink를 직접 모델링하도록 보강했습니다.
- reviewer P1의 pnpm 내부 symlink 실패는 현재 source standalone의 실제 symlink 2개, 반복 builder, final `--with-next-build`에서 재현되지 않았습니다.
- `corepack pnpm multi-agent:guard`: PASS
- `git diff --check`: PASS
- `pnpm verify` 내부 DART rules quality는 `tmp/dart/rules_eval.json` 부재로 기존 정책대로 SKIP됐고 전체 command exit code는 0이었습니다.

## 남은 리스크

- strict no-symlink 정책이므로 향후 Next standalone에 필요한 내부 symlink가 추가되면 builder/install이 해당 경로를 표시하며 중단합니다. 자동 허용하지 않고 필요성과 materialization 경계를 별도 검토해야 합니다.
- source-only alias 두 경로가 rename 또는 제거되면 상수와 fixture를 함께 갱신해야 합니다.
- native Windows에서는 symlink 권한과 `core.symlinks=false` checkout을 직접 검증하지 않았습니다. alias가 일반 파일이면 제거되지 않지만 외부 link가 아니며 checksum 대상이 됩니다.
- 설치 시 pnpm이 `sharp`, `unrs-resolver` build script를 ignored로 보고했지만 이번 WSL packaged launcher는 HTTP 200을 반환했습니다. 플랫폼별 이미지/resolve 경로는 별도 smoke가 필요합니다.
- reviewer P1은 현재 최종 경로에서 재현되지 않았지만 Next/pnpm 산출물 변화가 있으면 no-symlink guard가 release 중단 신호가 됩니다.
- rollback은 source-only alias 제거와 checksum walker symlink rejection을 함께 되돌리며 Issue #220의 runtime link 정규화는 유지합니다.

## 다음 라운드 우선순위

1. Issue #225에서 planning raw output과 persisted blob-ref output의 internal 타입 경계를 stored/public contract 변경 없이 좁힙니다.
2. native Windows 환경에서 Issue #220/#223의 junction, full install, packaged start를 검증합니다.
3. 기존 구조 Issue 목록을 최신 main에서 다시 분류해 FINLIFE, legacy planner, route policy의 다음 작은 단위를 선택합니다.
