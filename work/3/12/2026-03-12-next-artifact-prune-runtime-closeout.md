# 2026-03-12 next artifact prune runtime closeout

## 변경 파일
- `scripts/next_artifact_prune.mjs`
- `scripts/next_build_safe.mjs`
- `scripts/next_prod_safe.mjs`
- `README.md`
- `docs/README.md`
- `work/3/12/2026-03-12-next-artifact-prune-runtime-closeout.md`

## 사용 skill
- `planning-gate-selector`: 스크립트 변경에 맞는 최소 검증 세트를 고르기 위해 사용.
- `work-log-closeout`: `/work` 종료 기록 형식을 저장소 규칙에 맞추기 위해 사용.

## 변경 이유
- 루트의 `.next-e2e*`, `.next-host*`와 standalone 내부 `.next-*` shadow 디렉터리가 누적되면서 디스크를 쓰고 있었다.
- isolated distDir(`.next-build`)를 쓰는 runtime에서는 active dist 자체는 보존하고 나머지 shadow만 정리해야 production standalone 기동이 깨지지 않는다.

## 핵심 변경
- 공용 helper `scripts/next_artifact_prune.mjs`에 root/standalone prune, active-runtime guard, 직접 실행용 CLI를 정리했다.
- `scripts/next_build_safe.mjs`에서 build 전후 prune를 helper로 통일하고, standalone prune 시 현재 `effectiveDistDir` 이름은 보존하게 맞췄다.
- `scripts/next_prod_safe.mjs`가 standalone 후보를 `requestedDistDir -> metadataDistDir -> .next -> fallback` 순서로 고르게 바꿨다.
- `scripts/next_prod_safe.mjs`가 standalone prune 시 현재 `standaloneRuntime.distDir`는 보존하면서 `.next-e2e*` shadow와 루트 `.next-e2e*`/`.next-host*`만 정리하게 맞췄다.
- README와 docs index에 build/runtime launcher가 불필요한 next shadow 디렉터리를 자동 정리한다는 설명을 짧게 추가했다.

## 검증
- `find . -maxdepth 1 \( -name '.next-e2e*' -o -name '.next-host*' \) -printf '%f\n' | sort`
- `du -sch .next-e2e* .next-host* 2>/dev/null | tail -n 1`
- `pnpm build`
  - PASS 1회: root/standalone prune 로그 확인
- `node scripts/next_artifact_prune.mjs --cwd /home/xpdlqj/code/finance --dist-dir .next-build --preserve .next-build`
  - PASS: root 더미 `.next-e2e*`/`.next-host*` 제거, `.next-build/standalone/.next-build` 보존
- `node scripts/next_prod_safe.mjs --port 3411`
  - PASS: `.next-build` standalone runtime 기동 성공, prune 로그 확인
- `curl -I --max-time 5 http://127.0.0.1:3411`
  - PASS: `HTTP/1.1 200 OK`
- `node --check scripts/next_artifact_prune.mjs`
- `node --check scripts/next_build_safe.mjs`
- `node --check scripts/next_prod_safe.mjs`
- `pnpm exec eslint scripts/next_artifact_prune.mjs scripts/next_build_safe.mjs scripts/next_prod_safe.mjs`

## 남은 리스크
- 요청 범위 기준의 미해결 기능 리스크는 확인하지 못했다.
- build 재실행 중 일부 세션은 `143` 종료가 섞여 재현됐지만, 동일 라운드 안에서 `pnpm build` PASS 1회와 helper/runtime 실증으로 최종 변경 경로를 다시 확인했다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
