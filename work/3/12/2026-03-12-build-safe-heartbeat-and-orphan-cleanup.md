# 2026-03-12 build safe heartbeat and orphan cleanup

## 변경 파일
- `scripts/next_build_safe.mjs`

## 변경 이유
- 최근 `/work/3/12/2026-03-12-data-sources-prod-smoke-support-summary.md` 의 남은 리스크가 `pnpm build` 실패였다.
- 현재 워크트리에서 `pnpm build` 는 `Creating an optimized production build ...` 뒤 `ELIFECYCLE` 로 끝나거나, 세션 종료 뒤 orphan `next build` 프로세스가 남아 다음 재현을 오염시키는 패턴이 섞여 있었다.
- 이번 라운드는 build 전체 원인을 한 번에 단정하기보다, 재현 가능성과 cleanup 안정성을 먼저 고정하는 최소 수정에 집중했다.

## 핵심 변경
- `next_build_safe` 에 heartbeat 로그를 유지해 `build 진행 중... stage=compile` 상태를 주기적으로 남기도록 보강했다.
- 격리 distDir 사용 시 초기 `pages-manifest.json`, `interception-route-rewrite-manifest.js`, `types/routes.d.ts`, `types/validator.ts` 를 안전하게 스캐폴드하도록 확장했다.
- 부모 프로세스가 `SIGINT`/`SIGTERM`/`SIGHUP` 로 종료될 때 child build 도 같이 정리하고, 신호를 self 에 다시 relay 하도록 cleanup 로직을 보강했다.
- `childExited` 와 `forwardedParentSignal` 상태를 둬 child 종료 후 중복 kill 과 signal loop 를 피하게 했다.

## 검증
- `node --check scripts/next_build_safe.mjs`
  - PASS
- `pnpm exec eslint scripts/next_build_safe.mjs`
  - PASS
- `timeout 12s env NEXT_BUILD_HEARTBEAT_MS=3000 node scripts/next_build_safe.mjs --webpack > /tmp/finance-build-direct-heartbeat.log 2>&1`
  - [부분 확인] PASS
  - `elapsed=3s/6s/9s`, `distDir=.next-build`, `stage=compile` heartbeat 확인
- `timeout 12s env NEXT_BUILD_HEARTBEAT_MS=3000 pnpm build > /tmp/finance-build-pnpm-heartbeat.log 2>&1`
  - [부분 확인] PASS
  - `elapsed=3s/6s/9s`, `distDir=.next`, `stage=compile` heartbeat 확인
- 수동 cleanup 검증
  - `/bin/bash -lc 'node scripts/next_build_safe.mjs --webpack > /tmp/finance-build-cleanup.log 2>&1 & ... kill "$PARENT" ...'`
  - `PARENT=1338124`, `CHILD=1338137`, 결과 `CHILD_CLEANED`
- `pnpm build`
  - FAIL
  - detached/일반 실행 모두 이번 라운드에서 full PASS 는 재현하지 못했고, 일부 시도는 `Creating an optimized production build ...` 뒤 `ELIFECYCLE` 로 끝났다.

## 남은 리스크
- 이번 수정으로 `build 진행 상태 불투명`과 `parent 종료 뒤 orphan next build 잔존` 리스크는 현재 범위에서 닫았다.
- 하지만 현재 워크트리 기준 `compile stage` 장기 정체 또는 조기 종료의 근본 원인까지는 닫지 못했다.
- 따라서 이번 라운드 종료 시점에도 `pnpm build` 최종 PASS 와 `planning:v2:prod:smoke` 재확인은 [검증 필요] 상태로 남는다.
- 다음 라운드는 `compile stage` 에서 실제로 어떤 import/page/API 경로가 멈추는지 단일 isolated distDir 기준으로 더 좁혀야 한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
