# 2026-03-12 manager 리스크 batch 우선순위 재정리

## 변경 파일
- 코드/문서 수정 없음
- `work/3/12/2026-03-12-manager-risk-batch-priority-refresh.md`

## 사용 skill
- `planning-gate-selector`: 현재 dirty worktree에서 메인 에이전트가 단독 소유해야 할 최종 검증 세트를 최소/충분 기준으로 다시 고정하는 데 사용했다.
- `work-log-closeout`: 이번 라운드의 조사 근거, 미실행 검증, 다음 라운드 우선순위를 `/work` 형식으로 정리하는 기준으로 사용했다.

## 변경 이유
- 최신 closeout 기준으로 `planning/report`, `DART/data-sources`, `ops/docs`는 개별 배치 재검증 근거가 이미 있었지만, 저장소 전체 dirty worktree는 여전히 매우 컸다.
- 이번 라운드 목표는 새 기능 구현이 아니라, 현재 시점에서 실제로 남아 있는 리스크를 기능축 기준으로 다시 자르고 메인 에이전트의 single-owner 최종 게이트를 구체화하는 일이었다.
- 특히 `.next*` 산출물 누적과 repo runtime 프로세스 공존 여부를 확인하지 않으면 final build/e2e/release 제안이 실제 운영 절차와 어긋날 수 있었다.

## 핵심 변경
- 최신 `/work`와 관련 closeout를 다시 읽어 `planning/report`, `DART/data-sources`, `ops/docs`는 현재 기준 blocker 부재, `planning v3`와 release integration은 미분리 리스크로 남아 있음을 재정리했다.
- `git status --short` 기준 dirty worktree 규모를 다시 확인했고, 대략 `planning-report-v2 216`, `planning-v3 128`, `ops-docs-scripts 55`, `dart-data-sources 39`, `multi-agent 32`, `e2e-infra 12`로 큰 축을 재분류했다.
- `scripts/release_verify.mjs`와 `package.json` scripts를 확인해 현재 최종 게이트 제안의 기본축을 `pnpm release:verify`, `pnpm build`, `pnpm e2e:rc`, 필요 시 `pnpm planning:v2:prod:smoke`로 고정했다.
- 현재 루트에 `.next`, `.next-build`, `.next-build-check`, `.next-build-manual`, `.next-build-mem`, `.next-build-select-ops`, `.next-build-setsid`, `.next-build-setsid-1773245573`, `.next-build-trace`, `.next-build-tty`, `.next-build-verify`, `.next-debug`, `.next-debug-access-check`, `.next-debug-ds`, `.next-rawbuild`, `.next-turbo-1773245715`와 standalone shadow가 남아 있음을 확인했다.
- 동시에 repo runtime 프로세스(`playwright`, `next_dev_safe`, `next dev`)가 살아 있어, 메인 최종 게이트 전에는 먼저 해당 프로세스를 정리하거나 종료를 기다린 뒤 `pnpm cleanup:next-artifacts`를 single-owner로 실행해야 한다는 전제를 기록했다.

## 검증
- `sed -n '1,220p' work/3/12/2026-03-12-ops-docs-release-runbook-alignment-closeout.md`
  - PASS
- `git status --short`
  - PASS
- `sed -n '1,240p' .codex/skills/planning-gate-selector/SKILL.md`
  - PASS
- `sed -n '1,220p' multi_agent.md`
  - PASS
- `rg -n "^## (남은 리스크|미실행 검증|이번 라운드 완료 항목|다음 라운드 우선순위)|^# 2026-03-12" work/3/12/*.md`
  - PASS
- `sed -n '1,220p' work/3/12/2026-03-12-planning-report-batch-verification-closeout.md`
  - PASS
- `sed -n '1,220p' work/3/12/2026-03-12-dart-data-sources-batch-verification-closeout.md`
  - PASS
- `sed -n '1,220p' work/3/12/2026-03-12-final-verification-single-owner-guard.md`
  - PASS
- `node -e "const p=require('./package.json'); ..."`
  - PASS
- `sed -n '1,220p' work/3/12/2026-03-12-afternoon-risk-closeout.md`
  - PASS
- `sed -n '1,220p' work/3/12/2026-03-12-build-prod-smoke-runtime-closeout.md`
  - PASS
- `sed -n '1,220p' work/3/12/2026-03-12-planning-release-verify-hardening-closeout.md`
  - PASS
- `sed -n '1,220p' work/3/12/2026-03-12-planner-legacy-redirect-and-e2e-guard-closeout.md`
  - PASS
- `python3 - <<'PY' ... git status bucket count ... PY`
  - PASS
- `sed -n '1,260p' scripts/release_verify.mjs`
  - PASS
- `find . -maxdepth 1 \\( -name '.next' -o -name '.next-*' -o -name '.next-e2e*' -o -name '.next-host*' -o -name '.next-build*' \\) -print | sort`
  - PASS
- `sed -n '1,240p' scripts/next_artifact_prune.mjs`
  - PASS
- `ps -eo pid=,args= | rg '/home/xpdlqj/code/finance|next_build_safe.mjs|next_prod_safe.mjs|next_dev_safe.mjs|playwright_with_webserver_debug.mjs|next/dist/bin/next'`
  - PASS
- `node --input-type=module - <<'EOF' ... listRepoManagedRuntimeProcesses ... EOF`
  - PASS

## 미실행 검증
- `pnpm cleanup:next-artifacts`
  - 미실행. 현재 repo runtime 프로세스가 살아 있어 helper가 skip 또는 충돌할 수 있는 상태라, 이번 라운드에서는 제안만 고정했다.
- `pnpm release:verify`
  - 미실행. 이번 라운드는 리스크 분해와 single-owner 최종 게이트 제안이 목표였다.
- `pnpm build`
  - 미실행. 동일.
- `pnpm e2e:rc`
  - 미실행. 동일.
- `pnpm planning:v2:prod:smoke`
  - 미실행. 동일.

## 남은 리스크
- `planning/report`와 `DART/data-sources`는 개별 배치 재검증 근거가 있지만, 현재 저장소 전체 dirty worktree에서는 `planning v3`와 release integration이 아직 별도 closeout 없이 큰 덩어리로 남아 있다.
- 루트에 누적된 `.next*`/standalone shadow가 많고, 실제 repo `playwright`/`next dev` 프로세스가 살아 있어 메인 최종 게이트를 바로 겹쳐 돌리면 다시 false negative가 날 가능성이 높다.
- 현재 시점의 가장 안전한 single-owner 최종 검증 순서는 `기존 runtime 정리 확인 -> pnpm cleanup:next-artifacts -> pnpm release:verify -> pnpm build -> pnpm e2e:rc -> [ops/runtime 변경 포함 시] pnpm planning:v2:prod:smoke`다.
- `release:verify`는 현재 `test`, `planning:v2:complete`, `multi-agent:guard`를 required로, `planning:v2:compat`, `planning:v2:regress`를 optional로, `planning:ssot:check`를 advisory로 실행하므로 이 순서를 기준으로 중복 게이트를 줄여야 한다.

## 이번 라운드 완료 항목
1. 최신 closeout 기준으로 이미 닫힌 축과 아직 미분리인 축을 다시 구분
2. dirty worktree를 기능축 규모 기준으로 재계수
3. 메인 에이전트 single-owner 최종 게이트 순서 제안 고정
4. 현재 `.next*` 산출물 및 active runtime 프로세스 전제 확인

## 다음 라운드 우선순위
1. active runtime 프로세스가 비는 시점에 메인 에이전트가 `pnpm cleanup:next-artifacts -> pnpm release:verify -> pnpm build`를 단독 실행
2. 사용자 경로/셀렉터 영향까지 release 후보로 묶을 배치라면 같은 메인 소유권으로 `pnpm e2e:rc`까지 이어서 확정
3. `planning v3` 변경군은 별도 batch로 다시 잘라 전용 closeout과 최소 검증 세트를 남기기
