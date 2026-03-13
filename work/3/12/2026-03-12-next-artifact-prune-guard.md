# 2026-03-12 next artifact prune guard

## 변경 파일
- `package.json`
- `scripts/next_artifact_prune.mjs`
- `scripts/next_build_safe.mjs`
- `scripts/next_dev_safe.mjs`
- `scripts/next_prod_safe.mjs`
- `work/3/12/2026-03-12-next-artifact-prune-guard.md`

## 사용 skill
- `planning-gate-selector`: 런타임/ops 스크립트 변경에 맞는 최소 검증 세트를 `build + verify + 스크립트 직접 검증`으로 좁히는 데 사용.
- `work-log-closeout`: 이번 라운드의 변경, 검증, 잔여 리스크를 저장소 형식에 맞춰 정리하는 데 사용.

## 변경 이유
- 루트의 `.next-e2e*`, `.next-host*`를 한 번 지워도 새 dev/e2e/prod 실행에서 다시 누적될 수 있었다.
- `.next/standalone` 내부에도 같은 패턴의 shadow 디렉터리가 남아 build 산출물까지 계속 더럽힐 수 있었다.
- 기존 prune 로직은 dev 전용 프로세스만 보고 판단하거나 직접 실행 가능한 수동 진입점이 없어, 재발 방지 기준이 충분히 닫히지 않았다.

## 핵심 변경
- `scripts/next_artifact_prune.mjs`를 공용 helper + CLI로 확장해, 루트와 `.next/standalone`의 `.next-e2e*`/`.next-host*`를 같은 규칙으로 정리하게 했다.
- prune helper는 `ps` + `/proc/<pid>/cwd` 기준으로 같은 저장소의 `dev/build/prod/playwright` 런타임을 감지하고, 활성 프로세스가 있으면 기본값으로 정리를 건너뛰게 했다.
- `scripts/next_dev_safe.mjs`는 새 dev 포트를 고른 직후 현재 포트에 대응하는 숨김 distDir만 보존하고 나머지 루트 산출물을 정리하게 했다.
- `scripts/next_build_safe.mjs`와 `scripts/next_prod_safe.mjs`는 성공/시작 경로에서 root/standalone prune를 공용 helper로 호출하고, 자기 자신 PID는 무시하도록 맞췄다.
- `package.json`에 `cleanup:next-artifacts`를 추가해 수동 정리 진입점을 만들었다.

## 검증
- `node --check scripts/next_artifact_prune.mjs`
  - PASS
- `node --check scripts/next_dev_safe.mjs`
  - PASS
- `node --check scripts/next_build_safe.mjs`
  - PASS
- `node --check scripts/next_prod_safe.mjs`
  - PASS
- `pnpm exec eslint scripts/next_artifact_prune.mjs scripts/next_dev_safe.mjs scripts/next_build_safe.mjs scripts/next_prod_safe.mjs`
  - PASS
- `pnpm exec eslint scripts/next_prod_safe.mjs`
  - PASS
- `pnpm cleanup:next-artifacts --standalone-only --dist-dir .next`
  - PASS [실행 진입점 확인]
- guard 동작 실증
  - `mkdir -p .next-e2e-ci-check/dev .next-host-ci-check/dev .next/standalone/.next-e2e-ci-check/dev .next/standalone/.next-host-ci-check/dev`
  - `node scripts/next_artifact_prune.mjs --dist-dir .next`
    - PASS: 활성 build가 있을 때 `skipped active-runtime build:...` 출력과 함께 정리를 건너뜀
  - `node scripts/next_artifact_prune.mjs --dist-dir .next --allow-running`
    - PASS: 루트와 `.next/standalone`의 테스트 디렉터리를 모두 제거함
  - `find . -maxdepth 1 -type d \( -name '.next-e2e-ci-check' -o -name '.next-host-ci-check' \) | sort && find .next/standalone -maxdepth 1 -type d \( -name '.next-e2e-ci-check' -o -name '.next-host-ci-check' \) | sort`
    - PASS: 출력 없음
- `setsid -f /bin/bash -lc 'pnpm -C /home/xpdlqj/code/finance build >/tmp/finance-next-artifacts-build.log 2>&1; printf "%s\n" "$?" >/tmp/finance-next-artifacts-build.exit'`
  - PASS: `/tmp/finance-next-artifacts-build.exit = 0`
  - build log에서 `compile -> type-checking -> static-generation` 진행과 종료 후 prune 로그 확인
- `setsid -f /bin/bash -lc 'pnpm -C /home/xpdlqj/code/finance verify >/tmp/finance-next-artifacts-verify.log 2>&1; printf "%s\n" "$?" >/tmp/finance-next-artifacts-verify.exit'`
  - FAIL [범위 외 기존 오류]
  - `.next/dev/types/routes.d.ts`, `.next/dev/types/validator.ts`의 TypeScript 오류로 exit 2

## 남은 리스크
- 이번 라운드 범위인 `.next-e2e*`/`.next-host*` 누적과 수동/자동 prune 경로는 닫았지만, `pnpm verify`는 기존 `.next/dev/types/*` 오류 때문에 여전히 깨진다.
- 포트 바인드가 막힌 현재 Codex 실행 환경에서는 `next_dev_safe` 자체 기동 재현은 못 했고, 대신 helper/CLI와 build 경로로 간접 검증했다.
- `package.json`, `scripts/next_dev_safe.mjs`, `scripts/next_prod_safe.mjs`는 세션 이전부터 다른 수정이 함께 있는 dirty 파일이라 후속 병합 시 이번 변경만 골라 확인할 필요가 있다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
