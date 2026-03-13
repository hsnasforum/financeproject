# 2026-03-12 ops/docs release-runbook 정합성 closeout

## 변경 파일
- `docs/release.md`
- `docs/release-checklist.md`
- `docs/runbook.md`
- `docs/maintenance.md`
- `docs/planning-v2-release-checklist.md`
- `work/3/12/2026-03-12-ops-docs-release-runbook-alignment-closeout.md`

## 사용 skill
- `planning-gate-selector`: 이번 docs-only 배치에서 `current-screens` guard와 `multi-agent` guard만으로 닫을 수 있는 최소 검증 세트를 고정하는 데 사용했다.
- `work-log-closeout`: 변경 문서, 실행한 검증, 남은 리스크, 다음 라운드 우선순위를 `/work` 형식으로 정리하는 기준으로 사용했다.

## 변경 이유
- 최신 `/work` 기준 다음 우선순위는 `ops/docs` 축을 기능 수정과 분리한 문서·운영 규칙 전용 batch로 정리하는 일이었다.
- manager 분해 결과, 이번 배치는 `release/runbook` 축의 운영 규칙 드리프트와 `current-screens` 정합성 확인까지만 다루는 것이 가장 안전했다.
- 실제 조사에서 `release:verify` 구성, `pnpm build:detached` helper, Playwright E2E 재현 명령, single-owner 최종 게이트 원칙이 문서마다 서로 다르게 적혀 있었다.

## 핵심 변경
- `docs/release.md`, `docs/release-checklist.md`, `docs/planning-v2-release-checklist.md`를 현재 `scripts/release_verify.mjs` 계약에 맞게 정리했다.
- `release:verify`의 필수 게이트를 `pnpm test`, `pnpm planning:v2:complete`, `pnpm multi-agent:guard`로 고정하고, `planning:v2:compat`/`planning:v2:regress`는 optional, `planning:ssot:check`는 advisory라는 점을 문서에 반영했다.
- `docs/runbook.md`에서 실존하지 않는 `pnpm test:e2e`를 제거하고, 기본 E2E 재현 명령을 `pnpm e2e:rc`로 바로잡았다.
- `docs/maintenance.md`에는 release 최소 게이트를 `pnpm release:verify && pnpm build`로 맞추고, `pnpm build`/`pnpm e2e:rc`/`pnpm release:verify`를 single-owner로 순차 실행해야 한다는 운영 메모를 남겼다.
- `docs/current-screens.md`는 문서 추가 수정 없이 `pnpm planning:current-screens:guard` PASS로 현재 route 카탈로그 정합성만 확인했다.

## 검증
- `git diff --check -- docs/release.md docs/release-checklist.md docs/runbook.md docs/maintenance.md docs/planning-v2-release-checklist.md`
  - PASS
- `pnpm planning:current-screens:guard`
  - PASS (`5 files / 9 tests`)
- `pnpm multi-agent:guard`
  - PASS (`latestWorkNote=work/3/12/2026-03-12-ops-docs-release-runbook-alignment-closeout.md`)

## 미실행 검증
- `pnpm planning:ssot:check`
  - 미실행. 이번 라운드는 docs-only 배치이며, route 카탈로그 리스크는 `pnpm planning:current-screens:guard`로 좁게 닫았다.
- `pnpm build`
  - 미실행. 이번 라운드는 문서만 수정했고 build/runtime 코드는 건드리지 않았다.

## 남은 리스크
- 이번 라운드 범위의 `ops/docs` 문서 드리프트 blocker는 현재 기준으로 없다.
- shared `.next`를 쓰는 최종 build/e2e/release 게이트는 다음 기능 배치에서도 single-owner로 유지하는 운영 규칙만 계속 지키면 된다.

## 이번 라운드 완료 항목
1. `release/runbook/checklist` 문서의 게이트 계약 드리프트 정리
2. `pnpm build:detached` helper와 single-owner 운영 원칙 문서 반영
3. 실존하지 않는 Playwright 명령(`pnpm test:e2e`) 제거
4. `pnpm planning:current-screens:guard` PASS로 route 카탈로그 정합성 확인

## 다음 라운드 우선순위
1. 큰 dirty worktree를 기능축별 작은 batch로 계속 분리
2. 실제 릴리즈 직전에는 single-owner로 `pnpm release:verify && pnpm build`를 다시 실행
3. 사용자 경로/셀렉터를 건드리는 다음 기능 batch에서는 `pnpm e2e:rc`를 기본 최종 게이트로 유지
