# 2026-08-15 Daily Refresh 완료 감사

## 변경 파일

- `work/8/15/2026-08-15-daily-refresh-completion-audit.md`

## 사용 skill

- `finance-skill-routing`: 운영 workflow 재감사에 필요한 최소 skill 조합을 선택했습니다.
- `planning-gate-selector`: focused 계약 테스트, diff 무결성, hosted runner와 PR check 감사를 검증 범위로 선택했습니다.
- `github:github`: Draft PR의 head/base, 변경 파일, 상태와 check를 확인했습니다.
- `github:gh-fix-ci`: Actions 원문 로그에서 Daily Refresh와 PR CI 실패 원인을 분리했습니다.
- `work-log-closeout`: 이번 완료 감사의 실행 근거와 잔여 위험을 기록했습니다.

## 변경 이유

- 현재 PR head와 GitHub Actions 상태를 다시 확인해 Node 20·pnpm 9 bootstrap 복구와 외부 설정 또는 변경 범위 밖 실패를 구분하기 위해 작성했습니다.
- 이번 라운드는 감사와 기록만 수행했으며 workflow, 계약 테스트, dependency, lockfile은 변경하지 않았습니다.

## 핵심 변경

- PR #279가 open Draft이고 로컬·원격 head가 `0269018407277186a08df2ff784dc8b5b858c2cf`로 일치함을 확인했습니다.
- Daily Refresh #171에서 pnpm `9.15.9`, Node `v20.20.2`, `pnpm install --frozen-lockfile`과 Prisma postinstall이 성공했음을 재확인했습니다.
- 이후 preflight는 필수 외부 데이터 env 누락으로 실패했고, refresh·자동 PR은 skip, artifact 업로드는 성공해 fail-closed 계약이 유지됐습니다.
- PR CI의 두 실패는 변경되지 않은 `nanoid <3.3.18`에 새 HIGH advisory가 반영된 dependency audit 실패로 확인했습니다.
- hosted run head 이후 현재 PR head까지 workflow와 계약 테스트 내용이 동일하고, `package.json`과 `pnpm-lock.yaml`도 기준 main 대비 변경되지 않았습니다.

## 검증

- `git fetch origin --prune`: PASS.
- `DATABASE_URL=file:/tmp/finance-daily-refresh-final-reaudit.db corepack pnpm test tests/daily-refresh-workflow-contract.test.ts tests/daily-refresh-ci-contract.test.ts tests/daily-refresh-ops-contract.test.ts`: PASS, 3 files / 22 tests.
- `git diff --exit-code 3a5c63eceb4c01779086e22768023a1b159f8172...HEAD -- .github/workflows/daily-refresh.yml tests/daily-refresh-workflow-contract.test.ts`: PASS.
- `git diff --exit-code origin/main...HEAD -- package.json pnpm-lock.yaml`: PASS.
- `git diff --check origin/main...HEAD`: PASS.
- Daily Refresh #171 (`31792501003`): Setup pnpm, Setup Node, Install 성공; preflight·evidence 실패, artifact 성공, 자동 PR skip.
- E2E Smoke #410 (`31792761255`): `core_flows`, `dart_index_present`, `dart_index_missing` 모두 PASS.
- CI #1236 (`31792761402`) 및 push CI (`31792758002`): `nanoid` advisory를 감지한 dependency audit에서 FAIL. dependency·lockfile 비변경으로 이번 toolchain 변경과 분리했습니다.

## 남은 리스크

- 필수 외부 데이터 secret/env가 구성되기 전에는 strict refresh와 실제 자동 PR 생성 성공을 검증할 수 없습니다.
- PR CI의 `nanoid` advisory는 이번 변경 범위 밖이지만 현재 병합 게이트에는 영향을 줍니다.
- 현재 main의 scheduled Daily Refresh는 PR이 병합되지 않아 기존 Corepack 경로로 계속 실패합니다. 이번 목표는 Draft PR 생성까지이며 main 반영은 별도 merge 결정이 필요합니다.
