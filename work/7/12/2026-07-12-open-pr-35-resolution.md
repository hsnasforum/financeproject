# 2026-07-12 열린 PR 35개 전수 해결

## 변경 파일

- `src/lib/planning/v3/indicators/cli/refresh.ts`
- `src/lib/planning/v3/indicators/store/index.ts`
- `scripts/planning_v2_desktop_build.mjs`
- `tests/desktop-artifact-provenance.test.ts`
- `work/7/12/2026-07-12-open-pr-35-resolution.md`
- 그 외 PR #250~#266의 기존 변경 파일은 각 merge commit과 해당 `work/7/11`, `work/7/12` 기록으로 main에 반영했습니다.

## 사용 skill

- `finance-skill-routing`: 구현·검증·종료 기록에 필요한 최소 skill 조합을 선택했습니다.
- `planning-gate-selector`: planning, route, release, UI 변경이 함께 있는 통합 검증 세트를 선택했습니다.
- `route-ssot-check`: #261, #262, #264, #265, #266의 route·navigation·production-hidden 계약을 확인했습니다.
- `dart-data-source-hardening`: #257의 refresh owner, 실패·부분 응답·freshness 관련 범위를 확인했습니다.
- `github:github`: 열린 PR 35개 인벤토리, base/head, stale 대체 관계, 병합 상태를 확인하고 GitHub 상태를 변경했습니다.
- `github:gh-fix-ci`: Actions가 repository command 실행 전 결제·spending-limit로 중단된 사실을 run/job/annotation으로 확인했습니다.
- `work-log-closeout`: 실제 변경, 실행한 검증, 잔여 리스크를 이 기록으로 정리했습니다.

## 변경 이유

- GitHub에 열린 PR이 35개 남아 있었고, 오래된 미병합 stack과 최신 검증 완료 PR이 섞여 있었습니다.
- stale PR을 그대로 병합하면 이미 최신 main에서 대체된 구조 변경을 다시 도입하거나 0표본 DART 평가 문서를 유효한 결과처럼 덮을 위험이 있었습니다.
- 최신 17개 PR은 개별 검증을 통과했지만 Actions가 결제 문제로 checkout 이전에 중단되어, 전체 조합 상태를 별도 통합 worktree에서 검증해야 했습니다.
- #259의 strict no-symlink release gate가 pnpm standalone dependency link를 portable regular tree로 materialize하지 못하는 #267 packaging 공백을 드러냈습니다.

## 핵심 변경

- #4와 #158, #159, #160, #164, #167, #168, #169, #172~#180, #184에 폐기·대체 근거를 남기고 닫았습니다.
- #250→#251→#252→#253→#254, #256→#266, #261→#262, #263→#264의 stack ancestry를 보존해 base를 main으로 순차 retarget하고 merge commit 방식으로 병합했습니다.
- #257의 비재무 월·분기 bucket 계산은 non-negative 범위에서 동작이 같은 `Math.trunc`로 바꿔 #266의 재무 반올림 fail-closed guard와 충돌하지 않게 했습니다.
- desktop builder는 source 내부 pnpm virtual-store directory link만 regular tree로 materialize하고 package-local dependency context, scoped package, Prisma generated client, 버전 격리, 유효한 A→B→A 순환을 보존합니다.
- source escape, destination/source overlap, dangling·file·unsupported directory symlink, 특수 파일, 악성 cycle, shadowed/unreachable active cycle은 계속 fail-closed합니다.
- 병합 직전 GitHub 상태는 #259만 open이며, 이 기록과 #267 수정은 #259의 최종 commit에 포함됩니다. #259 병합 후 open PR 0 여부는 connector로 다시 확인합니다.

## 검증

- `corepack pnpm multi-agent:guard`: PASS
- `corepack pnpm planning:ssot:check`: PASS, 5 files / 11 tests
- `corepack pnpm components:app-import:guard`: PASS, 187 files / reverse edge 0
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm lint`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm test`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:complete`: PASS, fast E2E 8 passed
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm planning:v2:compat`: PASS
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 pages
- `DATABASE_URL=file:./prisma/dev.db corepack pnpm e2e:rc`: PASS, 38 passed / 2 skipped
- #257 focused Vitest: PASS, 3 files / 17 tests
- #257 targeted ESLint: PASS
- #259 `tests/desktop-artifact-provenance.test.ts tests/release-artifact-provenance.test.ts`: PASS, 2 files / 23 tests
- #259 `DATABASE_URL=file:./prisma/dev.db corepack pnpm release:verify`: PASS
- #259 최신 main 통합 후 `DATABASE_URL=file:./prisma/dev.db corepack pnpm build`: PASS, 250 pages
- `node scripts/planning_v2_desktop_build.mjs --no-next-build --artifact-dir=/tmp/finance-pr259-final-artifact`: PASS
- 최종 artifact: symlink 0, 8,594 files, 369,000,354 bytes, Next·Prisma direct require PASS
- `node scripts/planning_v2_desktop_install.mjs --from=/tmp/finance-pr259-final-artifact --to=/tmp/finance-pr259-final-install`: PASS
- 설치본 `planning_v2_desktop_smoke.mjs`: PASS, run 생성·report·HTML export 확인
- production launcher clean harness: PASS, standalone Ready·`/planning` 응답·SIGTERM 종료 후 port close 확인
- 최초 inline launcher harness는 PowerShell 변수 보간으로 PID가 비어 cleanup이 timeout 됐습니다. launcher와 server를 수동 종료해 잔여 프로세스가 없음을 확인한 뒤, 임시 Bash harness로 동일 검증을 정상 완료했습니다.
- `git diff --check`: PASS

## 남은 리스크

- GitHub Actions는 계정 결제 실패 또는 spending limit 때문에 checkout 이전에 시작되지 않았습니다. 원격 CI 성공으로 기록하지 않았고, 위 로컬 통합·release 검증을 근거로 관리자 수동 병합했습니다.
- portable artifact가 약 146MB에서 약 369MB로 증가했습니다. pnpm package-local dependency context를 regular tree로 보존한 결과이며, 배포 용량·복사 시간 추적이 필요합니다.
- native Windows junction/reparse/open-handle 동작과 Node 20·pnpm 9 원격 release runner는 이 환경에서 실행하지 못했습니다.
- 동일 권한 로컬 writer가 lstat/realpath와 copy 사이에 source를 바꾸는 TOCTOU 가능성은 local-only packaging의 잔여 위험입니다.
- private repository의 현재 요금제에서는 ruleset과 protected `v*` tag 정책을 적용·검증할 수 없습니다.

## 다음 라운드 우선순위

- GitHub Billing & plans에서 결제 또는 spending limit를 복구한 뒤 최신 main의 required CI/E2E를 다시 실행합니다.
- Windows 실제 장비에서 desktop install, production launcher, junction/reparse/open-handle을 확인합니다.
- artifact 크기와 copy 시간을 release metric으로 기록하고, strict provenance를 유지한 중복 절감 방안을 별도 Issue로 검토합니다.
