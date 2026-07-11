# 2026-07-11 Issue #220 데스크톱 산출물 런타임 링크 경계 보강

## 변경 파일

- `scripts/planning_v2_desktop_build.mjs`
- `scripts/standalone_runtime_assets.mjs`
- `tests/desktop-artifact-provenance.test.ts`
- `work/7/11/2026-07-11-issue-220-desktop-artifact-symlink.md`

## 사용 skill

- `planning-gate-selector`: Next production wrapper와 release/ops script 변경에 필요한 단위 테스트, lint, build, production E2E, verify 범위를 선택했습니다.
- `work-log-closeout`: 실제 실행한 검증, 계약 영향, 잔여 리스크를 표준 종료 기록으로 정리했습니다.

## 변경 이유

- Issue: https://github.com/hsnasforum/financeproject/issues/220
- 작업 브랜치: `codex/220-desktop-artifact-symlink-boundary`
- 기준 main: `f576f7ca56a3bee7eaaf8186d5ffeee7527ee267`
- clean build 뒤 production E2E를 실행하면 `next_prod_safe.mjs`가 standalone의 static, public, prisma, Prisma 보조 package 세 곳을 절대 symlink로 바꿨습니다. 이후 desktop builder가 static directory를 덮어쓰며 `EISDIR`로 실패했습니다.
- static destination만 치환한 첫 수정은 빌드 실패를 막았지만, package symlink 세 곳이 checksum 집계에서 빠져 clean 산출물과 파일 수가 21개 달라졌습니다. 따라서 artifact 내부에서만 runtime link를 정규화하는 범위로 보강했습니다.

## 핵심 변경

- production runtime이 연결하는 package 목록을 `STANDALONE_RUNTIME_LINKED_PACKAGES`로 공개해 launcher와 artifact builder가 같은 대상 집합을 사용합니다.
- artifact 복사 helper에 destination 치환과 source symlink 실체화 옵션을 추가했습니다.
- copied standalone의 package link 세 곳은 실제 directory로 복사하고, root `public`/`prisma` link는 제거하며, nested `.next/static`은 실제 directory로 교체합니다.
- source `.next/standalone`과 실행 중인 production server의 link는 수정하지 않습니다.
- 최소 fixture Git 저장소에서 static/public/prisma/package runtime link를 재현하고 source link 보존 및 artifact 정규화를 회귀 테스트로 고정했습니다.
- public URL/API/응답 shape, DB schema, Prisma query semantics, cache/revalidation, desktop manifest schema와 checksum 알고리즘은 변경하지 않았습니다.

## 검증

- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, TypeScript 검사와 250 static pages 생성
- `PLANNING_SINGLE_USER_MODE=true DATABASE_URL=file:./prisma/dev.db node scripts/playwright_with_webserver_debug.mjs --runtime=production --port=3232 test tests/e2e/smoke.spec.ts --grep "dashboard renders" --workers=1 --reporter=line`: PASS, 1 test; standalone runtime link 6개 생성 확인
- baseline에서 `corepack pnpm vitest run tests/desktop-artifact-provenance.test.ts`: FAIL, 2/4 tests; copied static symlink 위 directory 복사 시 `EISDIR` 재현
- `node --check scripts/planning_v2_desktop_build.mjs`: PASS
- `corepack pnpm eslint scripts/planning_v2_desktop_build.mjs scripts/standalone_runtime_assets.mjs tests/desktop-artifact-provenance.test.ts`: PASS
- `corepack pnpm vitest run tests/desktop-artifact-provenance.test.ts tests/runtime/standalone-runtime-assets.test.ts`: PASS, 2 files / 6 tests
- `node scripts/planning_v2_desktop_build.mjs --no-next-build --artifact-dir=/tmp/finance-desktop-artifact-220-v2-clean`: PASS
- 같은 `.next`에서 production E2E 후 `node scripts/planning_v2_desktop_build.mjs --no-next-build --artifact-dir=/tmp/finance-desktop-artifact-220-v3-mutated`: PASS
- clean/mutated manifest 비교: PASS, checksum `7fa457611fc1066ba569cd1bf46cb96b17bd24ce656ff4c4e2378dfaaa291a7e`, fileCount `3707`, totalBytes `146513954` 모두 동일
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm vitest run tests/planning/auth/postgresReadinessScript.test.ts --reporter=dot`: PASS, 1 file / 15 tests
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `corepack pnpm lint`: PASS
- `corepack pnpm multi-agent:guard`: 첫 staged 실행은 `다음 라운드` 누락 1건으로 FAIL; 후속 우선순위 추가 후 PASS
- `git diff --check`: PASS
- `corepack pnpm verify`: FAIL, 변경과 무관한 test fixture 타입 불일치 10개 파일 17건에서 `tsc --noEmit` 중단; clean main에서도 재현했고 Issue #222로 분리했습니다.
- env 없는 첫 전체 테스트는 별도 worktree에 `.env`가 없어 `postgresReadinessScript.test.ts` 4건이 `DATABASE_URL` 해석 실패로 중단했습니다. 명시적 local SQLite URL로 해당 15건과 전체 테스트를 재실행해 통과했습니다.

## 남은 리스크

- native Windows에서 junction 복사와 실체화 동작은 이번 Linux/WSL 검증에 포함되지 않았습니다.
- source `.next/static` 자체가 없을 때 조용히 skip하는 기존 builder 동작은 유지했습니다.
- `--with-next-build` 단일 명령 경로 대신 실제 `pnpm build -> clean artifact -> production E2E -> artifact` 순서를 검증했습니다.
- tracked `tmp` symlink 두 곳은 clean/mutated artifact 모두에 남고 현재 checksum 집계 대상이 아닙니다. production E2E가 만든 runtime link와 별개이므로 이번 PR에서는 변경하지 않았으며 Issue #223으로 분리했습니다.
- `pnpm verify`의 기존 test fixture 타입 drift는 Issue #222에서 해소해야 합니다.
- 런타임 link 대상 목록이 추가되면 launcher와 artifact 정규화 대상이 함께 갱신되는지 관련 테스트를 보강해야 합니다.
- rollback 기준은 source standalone 변경, clean/mutated manifest 불일치, install/start 실패가 확인되는 경우 이번 artifact normalization commit을 되돌리고 기존 production E2E 순서 제한을 복원하는 것입니다.

## 다음 라운드 우선순위

1. Issue #222에서 `pnpm verify`를 막는 test fixture 타입 drift 17건을 production contract 변경 없이 해소합니다.
2. Issue #223에서 desktop artifact의 unmanaged absolute symlink와 checksum provenance 정책을 별도 검토합니다.
3. #220 merge 후 Windows junction 및 packaged install/start 검증을 플랫폼 가능한 환경에서 보강합니다.
