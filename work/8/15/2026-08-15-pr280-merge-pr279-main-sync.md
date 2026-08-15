# 2026-08-15 PR #280 병합 및 PR #279 main 동기화

## 변경 파일

- `package.json`: PR #280에서 `pnpm.overrides.nanoid`를 3.3.18로 갱신한 main 변경을 #279에 병합했습니다.
- `pnpm-lock.yaml`: nanoid 3.3.18 lockfile 변경을 main에서 그대로 병합했습니다.
- `work/8/15/2026-08-15-nanoid-3-3-18-audit-fix.md`: PR #280의 보안 패치 기록을 main에서 병합했습니다.
- `work/8/15/2026-08-15-pr280-merge-pr279-main-sync.md`: 병합·동기화·검증 근거를 기록했습니다.

## 사용 skill

- `finance-skill-routing`: 이번 GitHub 동기화·검증 라운드에 필요한 최소 local skill 조합을 선택했습니다.
- `planning-gate-selector`: workflow·계약 테스트와 main dependency 변경에 맞춰 audit, lint, 전체 테스트, build를 검증 범위로 선택했습니다.
- `work-log-closeout`: 실제 병합 SHA, 실행 명령, 검증 결과와 남은 원격 확인을 기록했습니다.
- `github:github`: PR #280과 #279의 head/base, diff, merge 상태를 대조했습니다.
- `github:gh-address-comments`: #280의 unresolved review thread와 changes requested 부재를 thread-aware GraphQL 조회로 확인했습니다.
- `github:gh-fix-ci`: #280과 #279의 GitHub Actions check·로그를 head SHA 기준으로 확인했습니다.
- `github:yeet`: 승인된 #280 병합과 #279 branch push 범위를 통제했습니다.

## 변경 이유

- nanoid 3.3.18 보안 패치 PR #280을 main에 병합한 뒤, Daily Refresh toolchain PR #279가 같은 dependency 기준을 소비하도록 최신 main을 비파괴적으로 동기화해야 했습니다.
- #279의 기존 CI 실패가 Daily Refresh 변경이 아니라 `nanoid <3.3.18` advisory 때문이었으므로, main 병합 후 해당 차단이 해소되는지 다시 검증해야 했습니다.

## 핵심 변경

- PR #280은 expected head `28cb75896118e81a6d2975d74b944584aed2f3f1`, base `b7bc1c369583dc39a6ca5816a821ef1496c6eb28`, 변경 파일 3개와 성공한 CI·E2E를 재확인한 뒤 Draft를 해제하고 merge commit `87b06b0086ab34f957831b057a54a232da31dbc6`으로 main에 병합했습니다.
- PR #279 branch에 `origin/main`을 일반 merge로 반영해 merge commit `82420fec9bc2b122982454ab0bf02f07dd21f59b`을 생성했습니다.
- rebase, force push, PR #279 Draft 해제·Ready 전환·병합은 수행하지 않았습니다.
- 최신 main 대비 #279의 제품 diff는 기존 Daily Refresh workflow·계약 테스트 범위로 유지되며 package/lockfile drift는 PR diff에서 제거됐습니다.

## 검증

- `DATABASE_URL=file:/tmp/finance-pr279-sync.db corepack pnpm install --frozen-lockfile`: PASS, pnpm 9.15.9.
- `corepack pnpm deps:audit`: PASS, packages=662 versions=687 advisories=0.
- `DATABASE_URL=file:/tmp/finance-pr279-contract.db corepack pnpm test tests/daily-refresh-workflow-contract.test.ts tests/daily-refresh-ci-contract.test.ts tests/daily-refresh-ops-contract.test.ts`: PASS, 3 files / 22 tests.
- `DATABASE_URL=file:/tmp/finance-pr279-lint.db corepack pnpm lint`: PASS.
- `DATABASE_URL=file:/tmp/finance-pr279-test.db corepack pnpm test`: PASS, 833 files / 3,005 tests.
- `DATABASE_URL=file:/tmp/finance-pr279-build.db corepack pnpm build`: PASS, 250 static pages.

## 남은 리스크

- #279의 새 remote head에 대한 GitHub CI·E2E Smoke는 push 후 확인해야 합니다.
- 외부 check가 pending이면 반복 대기하지 않고 현재 상태와 실행 SHA만 보고합니다.

## 다음 라운드 우선순위

- #279 새 head의 CI·E2E Smoke와 dependency audit 결과를 확인하고, Draft를 유지한 채 Ready for review 자격만 판정합니다.
