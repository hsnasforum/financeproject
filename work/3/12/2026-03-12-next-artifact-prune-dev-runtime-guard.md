# 2026-03-12 next artifact prune dev runtime guard

## 변경 파일
- `scripts/next_artifact_prune.mjs`
- `tests/next-artifact-prune.test.ts`
- `README.md`
- `docs/maintenance.md`
- `docs/runbook.md`
- `work/3/12/2026-03-12-next-artifact-prune-dev-runtime-guard.md`

## 사용 skill
- `planning-gate-selector`: cleanup helper와 운영 문서 변경 범위에 맞는 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실행한 검증, 남은 리스크를 `/work` 형식에 맞게 정리하는 데 사용.

## 변경 이유
- 현재 저장소는 dev runtime이 살아 있는 동안 `cleanup:next-artifacts`가 root transient 정리뿐 아니라 `.next-build*` 정리도 함께 막아, 오래된 isolated build 산출물이 계속 쌓일 수 있었다.
- release/runtime 1차 배치 기준으로 이번 라운드 목표는 shared runtime 전체를 크게 재구성하는 것이 아니라, dev 서버와 직접 겹치지 않는 `.next-build*` 정리만 더 안전하게 계속 수행하도록 좁히는 일이었다.

## 핵심 변경
- `scripts/next_artifact_prune.mjs`에 `.next-build*` 정리 전용 blocking runtime kind를 `build`, `prod`, `playwright`로 제한해, dev runtime만 살아 있을 때는 stale isolated build 정리를 계속 진행하도록 바꿨다.
- root transient(`.next-host*`, `.next-e2e*`)와 standalone shadow 정리는 기존처럼 active runtime이 있으면 그대로 skip 하도록 유지했다.
- `tests/next-artifact-prune.test.ts`를 추가해 `dev active -> stale .next-build* prune 계속`, `build active -> prune skip` 두 회귀를 고정했다.
- `README.md`, `docs/maintenance.md`, `docs/runbook.md`에 dev runtime이 살아 있을 때도 오래된 `.next-build*` 정리는 계속되지만 shared runtime 산출물 정리는 보류된다는 운영 메모를 추가했다.

## 검증
- `node --check scripts/next_artifact_prune.mjs`
  - PASS
- `pnpm exec eslint scripts/next_artifact_prune.mjs tests/next-artifact-prune.test.ts`
  - PASS
- `pnpm exec vitest run tests/next-artifact-prune.test.ts`
  - PASS
- `node scripts/next_artifact_prune.mjs --cwd <tmpdir>` CLI smoke
  - PASS: temp dir에 repo dev runtime을 띄운 상태에서 `root`/`standalone`은 `skipped active-runtime dev:*`, `root build`는 stale `.next-build-old*` 제거와 tracked `.next-build-live*` 보존을 확인
- `git diff --check -- scripts/next_artifact_prune.mjs tests/next-artifact-prune.test.ts README.md docs/maintenance.md docs/runbook.md`
  - PASS

## 미실행 검증
- `pnpm cleanup:next-artifacts`
  - 미실행. 실제 repo root에서 destructive cleanup을 돌리는 라운드는 아니었고, temp dir CLI smoke로 helper 동작만 검증했다.
- `pnpm release:verify`
  - 미실행. 이번 라운드는 release/runtime 1차 배치의 cleanup helper 축만 다뤘다.
- `pnpm build`
  - 미실행. 동일.

## 남은 리스크
- 이번 수정은 stale `.next-build*` 누적 리스크만 줄였고, active runtime 중 shared transient 산출물 정리는 여전히 skip 된다. 최종 게이트 전 single-owner cleanup 절차 자체는 계속 필요하다.
- `release:verify` 진입점에 cleanup/preflight를 자동 연결하는 일은 아직 하지 않았다.
- 현재 repo worktree는 여전히 크므로, 다음 runtime batch도 launcher/log/release gate를 별도 묶음으로 유지하는 편이 안전하다.

## 이번 라운드 완료 항목
1. `.next-build*` 정리의 runtime guard를 dev runtime과 분리
2. helper 직접 회귀 테스트 추가
3. cleanup 운영 메모를 README/docs에 반영

## 다음 라운드 우선순위
1. `release:verify` 앞단에 cleanup/preflight를 연결할지 별도 배치로 결정
2. `next_dev_safe` / `next_build_safe` / `next_prod_safe` 로그 정규화 여부를 별도 batch로 검토
3. active runtime이 비는 시점에 single-owner로 `pnpm cleanup:next-artifacts -> pnpm release:verify -> pnpm build` 실행 여부 판단
