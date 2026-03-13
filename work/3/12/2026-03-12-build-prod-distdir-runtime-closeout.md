# 2026-03-12 build/prod distDir runtime closeout

## 변경 파일
- `scripts/next_build_safe.mjs`
- `scripts/next_prod_safe.mjs`
- `work/3/12/2026-03-12-build-prod-distdir-runtime-closeout.md`

## 사용 skill
- `planning-gate-selector`: Next build/prod launcher 변경에 맞는 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 라운드 변경, 재현, 최종 검증 결과를 `/work` 형식에 맞게 정리하는 데 사용.

## 변경 이유
- 최신 closeout에서 `concurrent build`가 shared `.next-build`를 다시 밟는 리스크는 닫혔지만, 실제 재검증 중 두 가지 후속 blocker가 남아 있었다.
- 첫째, active dev runtime이 살아 있을 때 traced file copy가 `root .next/dev/build/package.json` 부재를 다시 밟을 수 있었다.
- 둘째, isolated distDir build를 production standalone으로 띄울 때 `next_prod_safe`가 static asset을 여전히 `.next/static`으로만 연결해 `/_next/static/*.css`가 404를 냈다.

## 핵심 변경
- `scripts/next_build_safe.mjs`가 active dev runtime을 감지하면 `root .next/dev/build/package.json`을 선제 scaffold하고, build 동안 주기적으로 유지하게 보강했다.
- 이 보강으로 traced file copy가 `/.next/dev/build/package.json` 부재 때문에 warning을 내는 경로를 차단했다.
- `scripts/next_prod_safe.mjs`는 standalone runtime static asset 링크를 고정 `.next/static`이 아니라 실제 `distDir/static`으로 맞췄다.
- 그 결과 rotated distDir(`.next-build-425028`) 기준 standalone server도 `/_next/static/css/...`와 `public` asset을 정상 서빙한다.

## 검증
- `node --check scripts/next_build_safe.mjs`
- `node --check scripts/next_prod_safe.mjs`
- `pnpm exec eslint scripts/next_build_safe.mjs scripts/next_prod_safe.mjs`
- `git diff --check -- scripts/next_build_safe.mjs scripts/next_prod_safe.mjs`
- `pnpm build`
  - PASS 1회: active dev runtime이 살아 있는 상태에서 `.next-build` isolated build 완료, trace copy warning 재발 없음.
- `pnpm build`
  - `[환경 관찰]` concurrent 재현 세션과 겹친 재실행 1회는 foreground exec에서 `ELIFECYCLE`로 끝나 detached 검증으로 전환했다.
- `test -f .next/dev/build/package.json && sed -n '1,40p' .next/dev/build/package.json`
  - PASS: scaffold file `{"type": "commonjs"}` 확인.
- `node scripts/build_detached.mjs --base-dir=/tmp/finance-build-batch`
  - PASS: `/tmp/finance-build-batch/finance-build-detached-2026-03-12T07-52-24-678Z.exit.json` 기준 `ok: true`, `code: 0`.
- `pnpm planning:v2:prod:smoke`
  - FAIL 1회: `standalone asset /_next/static/css/290fb0d87f689587.css responded 404`
- `node scripts/next_prod_safe.mjs --port 3102`
  - PASS: standalone runtime 직접 기동 후 문제 asset 경로 재현용 서버 준비.
- `curl -I --max-time 10 http://127.0.0.1:3102/_next/static/css/290fb0d87f689587.css`
  - FAIL: file은 존재하지만 runtime link target mismatch로 404 재현.
- `pnpm planning:v2:prod:smoke`
  - PASS: `/public/dart`, `/_next/static/css/290fb0d87f689587.css`, `/next.svg`, `/settings/data-sources`, remote probe block까지 통과.

## 남은 리스크
- blocker 없음.
- active dev runtime이 살아 있는 동안 장시간 build를 여러 개 겹쳐 띄우면 exec 환경에서 concurrent build noise가 섞일 수 있다. 최종 PASS/FAIL은 detached build 또는 single-owner build 기준으로 남기는 편이 안전하다.
- 현재 워크트리는 매우 dirty하므로, 다음 라운드도 기능축별 작은 batch 유지가 필요하다.

## 다음 라운드 우선순위
- `.next-build-*` 산출물 누적을 `cleanup:next-artifacts` 정책에 포함할지 판단
- 장시간 build 재현 절차를 `pnpm build:detached` 중심으로 문서/운영 규칙에 반영할지 검토
- 다음 batch에서도 active dev/build/prod 최종 게이트는 single-owner 원칙 유지
