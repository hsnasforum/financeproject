# 2026-03-12 concurrent build distdir closeout

## 변경 파일
- `scripts/next_build_safe.mjs`
- `README.md`
- `docs/maintenance.md`

## 사용 skill
- `planning-gate-selector`: Next build wrapper 변경에 맞는 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 라운드 변경, 실행한 검증, 환경 차단 사항을 `/work` 형식에 맞게 정리하는 데 사용.

## 변경 이유
- 직전 라운드의 남은 리스크는 active dev runtime이 살아 있는 상태에서 build warning/compile 장기 정체가 다시 섞일 때, `next_build_safe`가 concurrent repo build까지 공용 `.next-build`로 몰아넣는 점이었다.
- 실제 재현 중에도 repo 안에서 build가 겹치면 wrapper가 여전히 같은 fallback distDir를 재사용해 재현 자체를 오염시키는 경로가 확인됐다.
- 이번 배치는 active dev + concurrent build가 함께 있어도 각 build가 고유 distDir로 분리되도록 wrapper만 최소 수정하는 데 집중했다.

## 핵심 변경
- `scripts/next_build_safe.mjs`에 concurrent repo build 전용 distDir 분기(`.next-build-<pid>`)를 추가했다.
- active dev만 있는 기본 경로는 기존처럼 `.next-build`를 계속 쓰고, 다른 repo build가 감지될 때만 고유 distDir로 우회하도록 분기했다.
- README와 `docs/maintenance.md`에 shared dist 충돌 시 `.next-build-<pid>`로 우회하는 운영 규칙을 짧게 반영했다.
- 성공 build의 `.next-build-info.json`이 마지막 성공 distDir(`.next-build-425028`)를 가리키는 것도 확인했다.

## 검증
- `node --check scripts/next_build_safe.mjs`
- `pnpm exec eslint scripts/next_build_safe.mjs`
- `git diff --check -- scripts/next_build_safe.mjs README.md docs/maintenance.md`
- `env BUILD_FALLBACK_DIST_DIR=.next-build-check NEXT_BUILD_HEARTBEAT_MS=3000 timeout 12s node scripts/next_build_safe.mjs --webpack`
  - active dev만 있는 상태에서 `.next-build-check`로 분리되는 기본 경로를 확인했다.
- 같은 명령을 build가 이미 도는 동안 한 번 더 실행
  - `active repo build 감지로 .next-build-check-422494 로 분리 build 합니다.` 로그와 고유 tsconfig 경로(`.next-build-check-422494-tsconfig.json`)를 확인했다.
- `pnpm build:detached`
  - `/tmp/finance-build-batch/finance-build-detached-2026-03-12T07-52-24-678Z.exit.json` 기준 `ok: true`, `code: 0` PASS
  - 동시 재현용으로 먼저 띄운 `/tmp/finance-build-detached-2026-03-12T07-52-11-582Z.exit.json`은 후행 concurrent build 재현 중 `SIGTERM`으로 종료됐다. 최종 PASS 판정에는 사용하지 않았다.
- `pnpm planning:v2:prod:smoke`
  - FAIL: `server exited before ready (code=1, signal=none)`
- `node -e "const net=require('net'); ... listen({host:'127.0.0.1',port:3414}) ..."`
  - FAIL: `EPERM`
- `node -e "const net=require('net'); ... listen({host:'127.0.0.1',port:0}) ..."`
  - FAIL: `EPERM`

## 남은 리스크
- 이번 batch의 목표였던 `concurrent build가 shared .next-build를 다시 밟는 리스크`는 닫혔다. 실제 concurrent build 로그에서 `.next-build-<pid>`로 분리되고, 후행 build는 detached 기준으로 PASS까지 확인했다.
- `[blocked]` `pnpm planning:v2:prod:smoke` 재검증은 현재 exec 환경에서 `127.0.0.1` bind 자체가 `EPERM`으로 막혀 확인하지 못했다. 이번 변경은 `next_prod_safe.mjs`를 건드리지 않았고, 차단 원인은 prod runtime loopback bind 환경 제약으로 분리된다.
- ad hoc `timeout ... node scripts/next_build_safe.mjs --webpack` 재현은 wrapper/child 정리 상태를 혼동시킬 수 있었다. 다음에도 장시간 build 재현은 `pnpm build:detached`를 우선 쓰는 편이 안전하다.

## 이번 라운드 완료 항목
- concurrent repo build 감지 시 `next_build_safe`가 `.next-build-<pid>`로 분기하도록 고정
- detached build 기준으로 후행 concurrent build PASS 확인
- 운영 문서에 shared dist 충돌 시 우회 규칙 반영

## 다음 라운드 우선순위
- exec 환경의 `127.0.0.1` bind `EPERM` 원인을 별도 batch로 분리해 `next_prod_safe`/prod smoke 재검증 가능 상태 만들기
- 필요하면 stale `.next-build-*` 정리 정책을 `cleanup:next-artifacts`와 연결할지 검토
- ad hoc `timeout` 재현 대신 `build:detached`를 표준 장기 build 재현 절차로 문서화할지 판단
