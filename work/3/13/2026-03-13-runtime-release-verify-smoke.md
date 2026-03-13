# 2026-03-13 runtime release-verify smoke

## 변경 파일
- `work/3/13/2026-03-13-runtime-release-verify-smoke.md`

## 사용 skill
- `planning-gate-selector`: runtime smoke 배치에서 `cleanup preflight + release:verify`만 실행하는 최소 검증 세트를 유지하는 데 사용
- `work-log-closeout`: code-free smoke 라운드의 실제 실행 명령, PASS/FAIL, 첫 blocker를 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 runtime `release-verify smoke` 축이 어긋나므로, 검증 전용 배치로만 제한하고 planning-v3/user-facing surface는 다시 열지 않았다.

## 변경 이유
- latest `runtime build-artifact cleanup hardening` note가 다음 우선순위로 `pnpm release:verify` 1회 smoke만 별도 확인하라고 남겼다.
- cleanup helper와 build/release caller 수정은 이미 끝났으므로, 이번 라운드는 코드 수정 없이 실제 release caller가 끝까지 닫히는지만 확인하는 것이 목적이었다.

## 핵심 변경
- 코드 수정 없이 검증만 수행했다.
- `pnpm cleanup:next-artifacts -- --build-preflight`를 먼저 실행해 tracked isolated build의 `standalone/.data` shadow 정리 경로를 다시 확인했다.
- 이어서 `pnpm release:verify`를 1회 실행해 cleanup preflight 이후 release caller 전체를 실제로 태웠다.
- 첫 blocker는 runtime cleanup 재발이 아니라 마지막 `pnpm test` gate에서 `.next-build/standalone/**`와 `tmp/**` 아래 Playwright spec가 Vitest에 섞여 들어가는 문제로 분리됐다.

## cleanup preflight / release:verify 결과
- cleanup preflight
  - 명령: `pnpm cleanup:next-artifacts -- --build-preflight`
  - 결과: PASS
  - 관찰: active dev runtime은 계속 보호된 채로 root build preflight가 `.next-build/standalone/.data`를 실제로 제거했다.
- release:verify
  - 명령: `pnpm release:verify`
  - 결과: FAIL
  - cleanup preflight, `planning:v2:complete`, `multi-agent:guard`, `planning:v2:compat`, `planning:v2:regress`까지는 모두 통과했다.
  - 첫 실패는 마지막 `gate=test`에서 발생했다.

## 첫 blocker
- blocker 분류
  - runtime cleanup 재발 아님
  - release caller 내부 `pnpm test` 수집 범위 문제
- 정확한 명령/에러
  - 명령: `pnpm release:verify`
  - 실패 지점: `[release:verify] FAIL gate=test exit=1`
  - 대표 에러 1
    - `FAIL  .next-build/standalone/tests/e2e/flow-v3-import-to-cashflow.spec.ts`
    - `Error: Cannot find module './helpers/e2eTest' imported from '/home/xpdlqj/code/finance/.next-build/standalone/tests/e2e/flow-v3-import-to-cashflow.spec.ts'`
  - 대표 에러 2
    - `FAIL  tmp/flow-v3-import-to-cashflow-audit.spec.ts`
    - `Error: Playwright Test did not expect test() to be called here.`
- 해석
  - 이번 FAIL은 `cleanup:next-artifacts -- --build-preflight`가 `.next-build/standalone/.data`를 못 지워서 생긴 ENOTEMPTY 재발이 아니다.
  - release caller가 마지막 `pnpm test`에서 build output/임시 spec 파일까지 Vitest 대상으로 잡아버리는 독립 이슈다.

## 검증
- 기준선 확인
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,260p' work/3/13/2026-03-13-runtime-build-artifact-cleanup-hardening.md`
- 상태 확인
  - `git status --short -- scripts/next_artifact_prune.mjs scripts/next_build_safe.mjs scripts/release_verify.mjs tests/next-artifact-prune.test.ts README.md docs/maintenance.md docs/runbook.md docs/release.md work/3/13/2026-03-13-runtime-build-artifact-cleanup-hardening.md`
  - `ps -eo pid=,args= | rg '(/home/xpdlqj/code/finance|next_build_safe\.mjs|next_prod_safe\.mjs|playwright_with_webserver_debug\.mjs)'`
- smoke
  - `pnpm cleanup:next-artifacts -- --build-preflight`
  - PASS
  - `pnpm release:verify`
  - FAIL (`gate=test exit=1`)
- diff check
  - `bash -lc 'out=$(git diff --no-index --check -- /dev/null work/3/13/2026-03-13-runtime-release-verify-smoke.md 2>&1); status=$?; printf "%s" "$out"; if [ $status -eq 0 ] || { [ $status -eq 1 ] && [ -z "$out" ]; }; then exit 0; fi; exit $status'`
  - PASS

## 미실행 검증
- 코드 수정이 없어서 추가 `node --check`, `vitest`, `eslint`, `pnpm build`는 이번 라운드에서 다시 실행하지 않았다.
- `pnpm e2e:rc`
- planning-v3 direct UI/e2e

## 남은 리스크
- `release:verify`는 현재 cleanup/build-preflight 경로를 지나도 마지막 `pnpm test`에서 `.next-build/standalone/**`와 `tmp/**` Playwright spec 수집 문제로 막힌다.
- 이 blocker는 runtime cleanup hardening과는 별도 축이므로, 다음 라운드에서는 Vitest input 범위 또는 runtime test artifact 배제를 독립 배치로 잘라 보는 편이 안전하다.
- planning-v3/user-facing dirty는 이번 runtime smoke와 다시 섞지 않았다.

## 이번 라운드 완료 항목
- `cleanup:next-artifacts -- --build-preflight` PASS를 다시 확인했다.
- `pnpm release:verify`를 1회 끝까지 태워 실제 첫 실패가 runtime cleanup 재발이 아님을 분리했다.
- 코드 수정 없이 smoke-only 배치로 마감했다.

## 다음 라운드 우선순위
1. `release:verify test-collection blocker isolation` 같은 별도 runtime 배치로 `pnpm test`가 `.next-build/standalone/**`, `tmp/**` spec를 줍는 문제만 분리한다.
2. runtime blocker가 닫히기 전에는 planning-v3 user-facing surface를 다시 섞지 않는다.
