# 2026-03-12 build/prod smoke runtime closeout

## 사용 skill
- `planning-gate-selector`
  - 세션 로그 기준으로 skill 본문을 열어 build script, production smoke, user-visible production 페이지가 함께 걸린 변경의 최소 검증 세트를 정리하는 데 참조했다.
- `work-log-closeout`
  - 세션 로그 기준으로 skill 본문을 열어 이번 `/work` closeout 기록을 저장소 형식에 맞춰 정리하는 데 참조했다.

## 변경 파일
- `.gitignore`
- `README.md`
- `docs/data-sources-settings-ops.md`
- `docs/planning-v2-desktop-local.md`
- `scripts/next_build_safe.mjs`
- `scripts/next_prod_safe.mjs`
- `scripts/planning_v2_prod_smoke.mjs`
- `src/app/settings/data-sources/page.tsx`

## 변경 이유
- 이번 라운드의 실제 blocker는 `pnpm build` foreground 실행이 `143`으로 끊기며 PASS 근거를 남기지 못한 점, 그리고 `pnpm planning:v2:prod:smoke`가 production 공개 경로 대신 잘못된 readiness/port를 보면서 false fail 하던 점이었다.
- 내부 회의 결론은 기능 확장보다 runtime 경로를 먼저 닫는 것이 맞았고, 최소 수정 축은 아래 세 가지였다.
  1. 격리 build 산출물 재사용 경로 고정
  2. prod smoke의 실제 바인드 포트 추적
  3. production `/settings/data-sources`에서 dev 진단 용어 누출 제거

## 핵심 변경
- `next_build_safe`에 격리 build 메타(`.next-build-info.json`) 기록과 distDir 정리 실패 시 회전 fallback을 추가해, 이전 격리 build 충돌이 있어도 build/runtime 연결점을 남기게 했다.
- `next_prod_safe`가 `.next`뿐 아니라 마지막 격리 distDir도 찾아 standalone runtime을 띄우고, 해당 distDir의 `static`/`public` 자산을 같이 연결하도록 보강했다.
- `planning_v2_prod_smoke`는 production에서 실제 공개되는 `/public/dart`를 readiness 기준으로 바꾸고, `next_prod_safe` stdout의 `Bind: ... port=...`를 읽어 실제 바인드 포트로 후속 검증을 수행하게 수정했다.
- `planning_v2_prod_smoke`의 remote probe는 production 비노출 정책에 맞춰 `403`뿐 아니라 `404`도 정상 차단으로 인정하게 정리했다.
- `/settings/data-sources` production 안내 카드에서 dev 전용 진단 명칭을 직접 언급하지 않도록 문구를 줄였고, README/desktop local/data-sources ops 문서도 새 runtime 기준으로 맞췄다.

## 검증
- `node --check scripts/next_build_safe.mjs`
  - PASS
- `node --check scripts/next_prod_safe.mjs`
  - PASS
- `node --check scripts/planning_v2_prod_smoke.mjs`
  - PASS
- `pnpm exec eslint scripts/next_build_safe.mjs scripts/next_prod_safe.mjs`
  - PASS
- `pnpm exec eslint src/app/settings/data-sources/page.tsx scripts/planning_v2_prod_smoke.mjs scripts/next_build_safe.mjs scripts/next_prod_safe.mjs`
  - PASS
- `env NEXT_BUILD_HEARTBEAT_MS=5000 pnpm build`
  - [환경 관찰] foreground CLI 세션에서는 약 39초 뒤 `143`으로 끊겼다.
- `setsid -f /bin/bash -lc 'cd /home/xpdlqj/code/finance && env NEXT_BUILD_HEARTBEAT_MS=5000 pnpm build >/tmp/finance-build-final.log 2>&1; printf "%s\n" "$?" >/tmp/finance-build-final.exit'`
  - PASS
  - `/tmp/finance-build-final.exit = 0`
- `pnpm planning:v2:prod:smoke`
  - PASS
  - `ok local /public/dart reachable`
  - `ok standalone asset reachable`
  - `ok public asset reachable`
  - `ok /settings/data-sources read-only render`
  - `ok remote probe blocked (404)`

## 남은 리스크
- 저장소 코드 기준의 build/prod smoke blocker는 이번 라운드에서 닫혔다.
- 다만 현재 Codex foreground exec 환경에서는 장시간 `pnpm build`가 `143`으로 잘릴 수 있었다. 같은 환경에서 다시 재현할 때는 detached wrapper 또는 일반 사용자 셸에서 실행하는 편이 안정적이다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
