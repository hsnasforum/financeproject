# 2026-08-15 nanoid 3.3.18 dependency audit 복구

## 변경 파일

- `package.json`
- `pnpm-lock.yaml`
- `work/8/15/2026-08-15-nanoid-3-3-18-audit-fix.md`

## 사용 skill

- `finance-skill-routing`: dependency 보안 패치에 필요한 최소 skill 조합을 선택했습니다.
- `planning-gate-selector`: dependency audit, lint, 전체 테스트, build와 hosted CI·E2E를 검증 범위로 선택했습니다.
- `github:github`: 기준 main과 PR #279의 분리 범위를 확인했습니다.
- `github:gh-fix-ci`: PR #279 CI 로그의 `nanoid <3.3.18` advisory 원인을 확인했습니다.
- `github:yeet`: 별도 branch의 커밋·push·Draft PR 생성을 통제했습니다.
- `work-log-closeout`: 실제 변경·검증·잔여 위험을 기록했습니다.

## 변경 이유

- npm bulk advisory가 `nanoid <3.3.18`을 HIGH로 판정해 `pnpm deps:audit`와 CI Dependency audit이 차단됐습니다.
- pnpm override를 3.3.17에서 3.3.18로 최소 갱신해 advisory 범위를 벗어나도록 했습니다.

## 핵심 변경

- `package.json`의 `pnpm.overrides.nanoid`를 `3.3.18`로 변경했습니다.
- `pnpm-lock.yaml`의 override, package integrity, snapshot, `postcss@8.5.25` 참조만 3.3.18로 갱신했습니다.
- 다른 dependency version, workflow, audit script, 테스트, PR #279 Daily Refresh 파일은 변경하지 않았습니다.

## 검증

- `corepack pnpm install --lockfile-only`: PASS, pnpm `9.15.9`.
- `DATABASE_URL=file:/tmp/finance-nanoid-audit.db corepack pnpm install --frozen-lockfile`: PASS.
- `corepack pnpm deps:audit`: PASS, packages=662 versions=687 advisories=0.
- `DATABASE_URL=file:/tmp/finance-nanoid-lint.db corepack pnpm lint`: PASS.
- `DATABASE_URL=file:/tmp/finance-nanoid-test.db corepack pnpm test tests/deps-audit.test.ts`: PASS, 1 file / 6 tests.
- `DATABASE_URL=file:/tmp/finance-nanoid-full-test.db corepack pnpm test`: PASS, 833 files / 3,004 tests.
- `DATABASE_URL=file:/tmp/finance-nanoid-build.db corepack pnpm build`: PASS, 250 static pages.

## 남은 리스크

- npm advisory 데이터는 실시간 registry 응답에 의존하므로 원격 CI에서도 `pnpm deps:audit`를 다시 확인해야 합니다.
- GitHub CI·E2E가 완료되기 전에는 hosted runner의 최종 상태를 확정할 수 없습니다.

## 다음 라운드 우선순위

- Draft PR #280의 GitHub CI·E2E 성공과 head SHA 일치를 확인한 뒤, 검토·병합 가능 상태를 판단합니다.
