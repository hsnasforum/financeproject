# 2026-08-14 Daily Refresh toolchain 고정

## 변경 파일

- `.github/workflows/daily-refresh.yml`
- `tests/daily-refresh-workflow-contract.test.ts`
- `work/8/14/2026-08-14-daily-refresh-toolchain-pin.md`

## 사용 skill

- `finance-skill-routing`: 운영 workflow 변경에 필요한 최소 skill 조합을 선택했습니다.
- `planning-gate-selector`: 계약 테스트, 전체 테스트, `pnpm verify`, `pnpm build`, Hosted runner 검증을 게이트로 선택했습니다.
- `github:github`: 기준 SHA와 최근 Actions 실행, workflow job·step·로그를 확인했습니다.
- `github:gh-fix-ci`: 실패 job의 실제 로그를 기준으로 원인을 분리하고 수정 후 runner 단계를 재검증했습니다.
- `github:yeet`: 최신 `origin/main` 기반 격리 브랜치의 커밋·푸시·Draft PR 범위를 통제했습니다.
- `chrome:control-chrome`: 로그인된 GitHub에서 브랜치 `workflow_dispatch` 실행을 접수했습니다.
- `work-log-closeout`: 실제 변경·검증·잔여 위험을 이 문서에 정리했습니다.

## 변경 이유

- 기준 `origin/main`은 `b7bc1c369583dc39a6ca5816a821ef1496c6eb28`입니다.
- Daily Refresh #168과 #169는 Node `v20.20.2`에서 `corepack enable`이 pnpm `11.21.0`을 내려받아 `node:sqlite`를 찾지 못하면서 Install 단계에서 실패했습니다.
- 같은 기준 SHA의 성공한 일반 CI #1230은 `pnpm/action-setup@v6`의 `version: 9`로 pnpm `9.15.9`를 설치한 뒤 Node 20과 pnpm cache를 구성해 frozen install을 통과했습니다.
- 첫 수정 검증 run #170에서 toolchain 오류는 해소됐지만, `prisma generate`가 `DATABASE_URL` 누락으로 실패해 일반 CI와 같은 비밀값이 아닌 SQLite URL이 Install 단계에도 필요함을 확인했습니다.

## 핵심 변경

- Daily Refresh가 `pnpm/action-setup@v6`로 pnpm 9를 먼저 설치하고, `actions/setup-node@v5`의 Node 20·pnpm cache를 그 다음 구성하도록 순서를 고정했습니다.
- floating `corepack enable`을 제거하고 `pnpm install --frozen-lockfile`만 실행합니다.
- Install 단계에만 일반 CI와 같은 `DATABASE_URL: "file:./prisma/ci.db"`를 주입해 Prisma postinstall이 secret 없이 동작하도록 했습니다.
- 계약 테스트가 step 순서, action·Node·pnpm 버전, cache·lockfile 경로, frozen install, `corepack enable` 부재, install 전용 DB URL을 검증합니다.
- preflight, strict refresh, evidence·artifact `if: always()`, 자동 PR fail-closed와 승인 경로 allowlist는 변경하지 않았습니다.

## 검증

- `corepack pnpm install --frozen-lockfile`: PASS, 로컬 pnpm `9.15.9`로 564 packages 설치 및 Prisma generate 완료.
- `DATABASE_URL=file:/tmp/finance-daily-refresh-test.db corepack pnpm test tests/daily-refresh-workflow-contract.test.ts tests/daily-refresh-ci-contract.test.ts tests/daily-refresh-ops-contract.test.ts`: PASS, 3 files / 22 tests.
- `DATABASE_URL=file:/tmp/finance-daily-refresh-test.db corepack pnpm test`: PASS, 833 files / 3,005 tests.
- `DATABASE_URL=file:/tmp/finance-daily-refresh-test.db corepack pnpm verify`: PASS, lint·typecheck·보안·데이터 계약과 833 files / 3,005 tests 포함.
- `DATABASE_URL=file:/tmp/finance-daily-refresh-build.db corepack pnpm build`: PASS, Next.js production build와 250 static pages 생성 완료.
- `git diff --check`: PASS.
- Daily Refresh #170 (`31792248302`, head `4c3521ae`): pnpm `9.15.9`, Node `v20.20.2`, cache 복원까지 성공. Install은 Prisma postinstall의 `DATABASE_URL` 누락으로 실패했고 evidence failure·artifact success·자동 PR skipped가 유지됐습니다.
- Daily Refresh #171 (`31792501003`, head `3a5c63ec`): Setup pnpm, Setup Node, Install 모두 성공. 실제 버전은 pnpm `9.15.9`, Node `v20.20.2`이며 frozen install은 5.5초에 완료됐습니다.
- Daily Refresh #171은 다음 preflight에서 필수 외부 데이터 env가 없어 fail-closed 되었고, evidence failure·artifact success·자동 PR skipped가 유지됐습니다.
- `pnpm e2e:rc`: 미실행. UI·route·selector 동작을 변경하지 않았습니다.

## 남은 리스크

- 저장소 Actions의 필수 외부 데이터 secret/env가 비어 있어 Hosted runner에서 실제 refresh와 자동 PR까지는 검증하지 못했습니다. toolchain 이후 preflight가 의도대로 차단한 상태입니다.
- `workflow_dispatch`는 브랜치 workflow 정의를 실행하지만 Checkout 단계는 계약상 default branch를 가져옵니다. 이번 검증 시 package·lockfile은 기준 main과 동일해 Install 검증에는 영향이 없습니다.
- 최종 운영 확인은 변경 병합 후 필수 secret/env를 구성한 상태에서 scheduled run 또는 `workflow_dispatch`가 strict refresh까지 통과하는지 확인해야 합니다.

## 이번 라운드 완료 항목

- 최신 `origin/main` 기반 격리 브랜치에서 pnpm 9 → Node 20 cache → frozen install 순서를 구현했습니다.
- 첫 runner 실행에서 드러난 Prisma install env 누락을 Install 단계 한정으로 보완했습니다.
- 로컬 전체 검증과 GitHub-hosted runner의 실제 Install 성공을 확인했습니다.
- 기존 실패 진단·artifact·자동 PR 차단 계약의 보존을 확인했습니다.

## 다음 라운드 우선순위

- Draft PR의 CI 결과와 변경 범위를 확인합니다.
- 저장소 필수 외부 데이터 secret/env를 구성한 뒤 병합 후 Daily Refresh strict run을 재확인합니다.
