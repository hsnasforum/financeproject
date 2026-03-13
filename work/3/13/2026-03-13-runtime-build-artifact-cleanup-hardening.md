# 2026-03-13 runtime build-artifact cleanup hardening

## 변경 파일
- `scripts/next_artifact_prune.mjs`
- `scripts/next_build_safe.mjs`
- `scripts/release_verify.mjs`
- `tests/next-artifact-prune.test.ts`
- `README.md`
- `docs/maintenance.md`
- `docs/runbook.md`
- `docs/release.md`
- `work/3/13/2026-03-13-runtime-build-artifact-cleanup-hardening.md`

## 사용 skill
- `planning-gate-selector`: runtime cleanup helper + build/release caller 범위에서 `node --check + direct vitest + eslint + cleanup smoke + build smoke`를 최소 검증 세트로 고르는 데 사용
- `work-log-closeout`: runtime cleanup hardening 라운드의 실제 수정 파일, 실행/미실행 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 runtime `build artifact cleanup hardening` 축이 어긋나므로, build/release preflight hardening 범위로만 제한하고 planning-v3 route/UI/parser/import 흐름으로 넓히지 않았다.

## 변경 이유
- latest `planning-v3 shared-bodytone-surface-cleanup` 라운드에서 첫 `pnpm build`가 `ENOTEMPTY: directory not empty, rmdir '/home/xpdlqj/code/finance/.next-build/standalone/.data/news/items'`로 막혔다.
- 당시에는 `pnpm cleanup:next-artifacts` 뒤에 수동 `rmSync('.next-build/standalone/.data/news/items')`가 필요했다.
- 현재 runtime dirty cluster는 cleanup helper, build/release caller, direct test, README/docs로 응집돼 있었고 planning-v3 user-facing surface와 분리 가능했다.
- 그래서 이번 라운드는 “active runtime 보호는 유지하되, build/release 직전 tracked isolated build 내부 `standalone/.data` shadow는 자동 정리”하는 계약으로만 좁게 닫았다.

## ENOTEMPTY 재현/원인과 실제 cleanup contract
- 원인
  - 기존 cleanup은 오래된 `.next-build-*`, 대응 `-tsconfig.json`, stale build metadata는 정리했지만, 보존 대상 isolated build 내부 `standalone/.data/**` nested shadow는 별도 대상으로 보지 않았다.
  - `pnpm build` wrapper도 shared dev runtime이 있는 경우 root isolated build pre-prune 자체를 건너뛰고 있었기 때문에, 현재 dist 기준 preflight가 더 좁게 잠기지 않았다.
- 실제 조정
  - `scripts/next_artifact_prune.mjs`
    - root isolated build prune에 `build/prod/playwright`만 막는 runtime guard를 명시했다.
    - tracked/preserved isolated build 목록을 모아 `standalone/.data`만 지우는 `pruneStandaloneDataArtifactsForBuildPreflight()`를 추가했다.
    - CLI에 `--build-preflight`를 추가하고, 이 플래그일 때만 root build preflight cleanup을 실행하도록 했다.
  - `scripts/next_build_safe.mjs`
    - shared dev runtime이 있어도 root isolated build pre-prune는 계속 실행되도록 분리했다.
    - actual `pnpm build` 시작 직전에 `pruneStandaloneDataArtifactsForBuildPreflight()`를 호출해 tracked/current isolated dist의 nested `.data` shadow를 수동 rm 없이 정리하게 했다.
  - `scripts/release_verify.mjs`
    - preflight gate `cleanup:next-artifacts`를 `pnpm cleanup:next-artifacts -- --build-preflight`로 실행하도록 바꿨다.
    - 즉, `release:verify`도 같은 nested artifact cleanup 경로를 먼저 사용한다.
  - `tests/next-artifact-prune.test.ts`
    - dev runtime 아래에서는 tracked isolated build의 `standalone/.data` shadow가 제거되는 케이스를 추가했다.
    - prod runtime이 살아 있으면 같은 cleanup이 skip 되는 케이스도 추가해 active runtime 보호를 고정했다.

## build/release caller 조건부 포함 여부
- 열었다.
- 포함 이유
  - `scripts/next_build_safe.mjs`: `pnpm build`가 실제로 same cleanup contract를 쓰는지 닫으려면 직접 caller 연결이 필요했다.
  - `scripts/release_verify.mjs`: `release:verify` preflight도 같은 `--build-preflight` 경로를 쓰게 맞추려면 직접 수정이 필요했다.
- 열지 않은 caller
  - `scripts/build_detached.mjs`: 내부적으로 `pnpm build`를 위임하므로 이번 라운드에서 추가 수정은 불필요했다.

## 문서 반영
- `README.md`
  - `cleanup:next-artifacts -- --build-preflight`를 build/release 전용 preflight로 추가했다.
  - `pnpm build`와 `pnpm release:verify`가 같은 preflight cleanup 경로를 먼저 사용한다는 점을 반영했다.
- `docs/maintenance.md`
  - 운영 원칙에 build/release preflight cleanup과 active runtime skip 규칙을 명시했다.
- `docs/runbook.md`
  - foreground build 143 대응 절차를 `--build-preflight` + `pnpm build:detached` 기준으로 정리했다.
- `docs/release.md`
  - `release:verify` 시작 단계를 `pnpm cleanup:next-artifacts -- --build-preflight`로 갱신했다.

## 검증
- 기준선/상태 확인
  - `sed -n '1,260p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,260p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,280p' work/3/13/2026-03-13-planning-v3-shared-bodytone-surface-cleanup.md`
  - `git status --short -- scripts/next_artifact_prune.mjs scripts/release_verify.mjs tests/next-artifact-prune.test.ts README.md docs/maintenance.md docs/runbook.md docs/release.md scripts/next_build_safe.mjs scripts/build_detached.mjs`
- syntax
  - `node --check scripts/next_artifact_prune.mjs`
  - `node --check scripts/release_verify.mjs`
  - `node --check scripts/next_build_safe.mjs`
  - PASS
- direct test
  - `pnpm exec vitest run tests/next-artifact-prune.test.ts`
  - PASS (`4 tests`)
- eslint
  - `pnpm exec eslint scripts/next_artifact_prune.mjs scripts/release_verify.mjs scripts/next_build_safe.mjs tests/next-artifact-prune.test.ts`
  - PASS
- cleanup smoke
  - `pnpm cleanup:next-artifacts -- --build-preflight`
  - PASS
  - 관찰 결과: root transient/standalone cleanup은 active dev runtime 때문에 skip 됐고, root build preflight는 `.next-build/standalone/.data`를 실제로 제거했다.
- build smoke
  - `pnpm build`
  - PASS
  - 관찰 결과: explicit cleanup 직후 수동 `rm` 없이 build가 끝까지 완료됐다.
- repeated build smoke
  - `pnpm build`
  - PASS
  - 관찰 결과: 같은 repo 상태에서 재실행해도 `ENOTEMPTY` 재발 없이 build가 다시 완료됐다.
- diff check
  - `git diff --check -- scripts/next_artifact_prune.mjs scripts/release_verify.mjs README.md docs/maintenance.md docs/runbook.md docs/release.md`
  - `bash -lc 'out=$(git diff --no-index --check -- /dev/null scripts/next_build_safe.mjs 2>&1); status=$?; printf "%s" "$out"; if [ $status -eq 0 ] || { [ $status -eq 1 ] && [ -z "$out" ]; }; then exit 0; fi; exit $status'`
  - `bash -lc 'out=$(git diff --no-index --check -- /dev/null tests/next-artifact-prune.test.ts 2>&1); status=$?; printf "%s" "$out"; if [ $status -eq 0 ] || { [ $status -eq 1 ] && [ -z "$out" ]; }; then exit 0; fi; exit $status'`
  - `bash -lc 'out=$(git diff --no-index --check -- /dev/null work/3/13/2026-03-13-runtime-build-artifact-cleanup-hardening.md 2>&1); status=$?; printf "%s" "$out"; if [ $status -eq 0 ] || { [ $status -eq 1 ] && [ -z "$out" ]; }; then exit 0; fi; exit $status'`
  - PASS

## 미실행 검증
- `pnpm release:verify`
  - 이번 라운드는 cleanup helper + direct caller hardening 축이라 full release gate까지는 넓히지 않았다.
- `tests/planning/server/runtime/dataDir.test.ts`
- `tests/planning/storage/dataDir.test.ts`
- `pnpm e2e:rc`
- `pnpm planning:v2:complete`

## 남은 리스크
- `cleanup:next-artifacts` 기본 모드는 여전히 root build artifacts 중심 정리만 담당한다. nested `standalone/.data` cleanup은 의도적으로 `--build-preflight` 경로에서만 수행한다.
- 이번 라운드는 `release:verify` 전체를 돌리지는 않았으므로, 후속이 필요하면 build artifact 상태가 다시 쌓인 환경에서 `pnpm release:verify` 1회 smoke로 caller 경로를 재확인할 수 있다.
- planning-v3 user-facing surface dirty는 이번 runtime cleanup 라운드와 분리된 채로 남아 있다.

## 이번 라운드 완료 항목
- build/release preflight에서 tracked isolated build 내부 `standalone/.data` shadow를 자동 정리하는 cleanup helper 계약을 추가했다.
- active build/prod/playwright runtime이 있으면 같은 cleanup을 skip 하는 보호 규칙을 direct test로 고정했다.
- `pnpm build`와 `pnpm release:verify` caller를 같은 build-preflight cleanup 경로로 맞췄다.
- README/runbook/release/maintenance 문서를 실제 동작에 맞게 갱신했다.

## 다음 라운드 우선순위
1. runtime 축을 더 열 필요가 없으면 재오픈하지 않는다.
2. 후속 smoke가 필요하면 `pnpm release:verify` 1회만 별도 배치로 확인한다.
3. 이후에는 planning-v3 user-facing surface와 runtime cleanup 축을 다시 섞지 않는다.
