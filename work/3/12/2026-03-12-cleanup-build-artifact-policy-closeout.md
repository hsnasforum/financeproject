# 2026-03-12 cleanup build artifact policy closeout

## 변경 파일
- `scripts/next_artifact_prune.mjs`
- `scripts/next_build_safe.mjs`
- `scripts/next_prod_safe.mjs`
- `README.md`
- `docs/maintenance.md`
- `docs/runbook.md`
- `work/3/12/2026-03-12-cleanup-build-artifact-policy-closeout.md`

## 사용 skill
- `planning-gate-selector`: cleanup helper, build/prod wrapper, 운영 문서 변경에 맞는 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 라운드의 실제 변경, 실행한 검증, 남은 리스크를 `/work` 형식에 맞게 정리하는 데 사용.

## 변경 이유
- 최신 closeout 기준 남은 실제 운영 리스크는 `.next-build-*`와 대응 `-tsconfig.json`, stale build metadata가 cleanup 정책 밖에 남아 build/runtime 조사 로그를 계속 오염시키는 점이었다.
- `build:detached` 자체는 이미 주요 문서에 있었지만, cleanup과 연결된 single-owner 운영 순서가 아직 명시적으로 닫혀 있지 않았다.
- 이번 배치는 stale isolated build 정리를 helper 수준에서 고정하고, build/prod wrapper와 운영 문서에 같은 규칙을 연결하는 최소 수정으로 잠갔다.

## 핵심 변경
- `scripts/next_artifact_prune.mjs`에 root isolated build 정리 helper를 추가해, 오래된 `.next-build-*`, 대응 `-tsconfig.json`, stale `.next-build-info.json`을 정리하도록 확장했다.
- 같은 helper는 최신 tracked isolated build(`.next-build-info.json` 기준)와 그 tsconfig는 자동 보존하게 맞췄다.
- `scripts/next_build_safe.mjs`, `scripts/next_prod_safe.mjs`가 root transient prune와 별도로 root build prune도 호출하게 연결했다.
- `README.md`, `docs/maintenance.md`, `docs/runbook.md`에 `pnpm cleanup:next-artifacts`가 최신 성공 isolated build는 보존하고 오래된 build 산출물만 정리한다는 점, 장시간 build 재현 시 `pnpm build:detached`를 우선 쓰는 운영 순서를 반영했다.

## 검증
- `node --check scripts/next_artifact_prune.mjs`
- `node --check scripts/next_build_safe.mjs`
- `node --check scripts/next_prod_safe.mjs`
- `pnpm exec eslint scripts/next_artifact_prune.mjs scripts/next_build_safe.mjs scripts/next_prod_safe.mjs`
- `git diff --check -- scripts/next_artifact_prune.mjs scripts/next_build_safe.mjs scripts/next_prod_safe.mjs README.md docs/maintenance.md docs/runbook.md`
- temp fixture smoke
  - `node scripts/next_artifact_prune.mjs --cwd <tmpdir> --allow-running`
  - PASS: stale `.next-build-old`, `.next-build-older`, 대응 `-tsconfig.json`은 제거되고 tracked `.next-build-live`, `.next-build-live-tsconfig.json`, `.next-build-info.json`은 유지됨
- wrapper smoke
  - `pnpm cleanup:next-artifacts -- --cwd <tmpdir> --allow-running --preserve .next-build-keep`
  - PASS: stale `.next-build-drop`, 대응 `-tsconfig.json`, stale `.next-build-info.json` 제거, `.next-build-keep`과 대응 `-tsconfig.json` 유지
- `pnpm build:detached -- --base-dir=/tmp/finance-build-cleanup-policy`
  - PASS: `/tmp/finance-build-cleanup-policy/finance-build-detached-2026-03-12T08-06-51-325Z.exit.json` 기준 `ok: true`, `code: 0`
- `pnpm planning:v2:prod:smoke`
  - PASS: standalone asset, public asset, `/settings/data-sources`, remote probe block까지 통과
- `pnpm cleanup:next-artifacts`
  - PASS: 현재 repo에서 active dev runtime이 살아 있어 destructive cleanup 대신 `skipped active-runtime ...`로 안전 정지 확인

## 남은 리스크
- blocker 없음.
- 현재 repo는 active dev runtime이 살아 있는 상태라 실제 root cleanup은 safety skip으로 동작했다. 오래된 실제 repo 산출물 정리는 runtime이 비는 시점에 single-owner로 실행하는 편이 안전하다.
- 큰 dirty worktree는 여전히 남아 있어, 다음 라운드도 기능축별 작은 batch 유지가 필요하다.

## 다음 라운드 우선순위
- active runtime이 비는 시점에 single-owner로 `pnpm cleanup:next-artifacts -> pnpm release:verify -> pnpm build` 최종 게이트 실행 여부 판단
- 다음 장시간 build 재현이 필요하면 `pnpm build:detached`를 우선 사용하고 exit json 기준으로 앱 회귀와 exec 환경 제약을 분리
- 큰 dirty worktree는 계속 기능축별 작은 batch로 분리 유지
