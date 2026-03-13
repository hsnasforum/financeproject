# 2026-03-12 build runtime investigation

## 변경 파일
- 없음 (최종 상태 기준 코드 변경 미유지)

## 변경 이유
- 최근 `/work` 기록에서 아직 닫히지 않은 실제 미해결 항목은 `pnpm build` full PASS 근거 부족과 그에 연쇄된 production smoke 미완료였다.
- 이번 라운드 목표는 build 실패가 코드 회귀인지, 실행 세션 제약인지, 현재 워크트리 전체 build 문제인지 분리하는 것이었다.

## 핵심 변경
- `manager` 분해 기준으로 build 잔여 리스크만 단일 축으로 다시 재현했다.
- `pnpm build`, `node scripts/next_build_safe.mjs --webpack`, detached build를 각각 실행해 세션 종료와 build 자체 종료를 분리했다.
- `next.config.ts`에 일시적으로 `webpackBuildWorker: false`를 적용해 봤지만 안정화 근거를 만들지 못해 최종 상태에서는 유지하지 않았다.
- detached build 기준으로 `.next-build/server/*` 산출물은 더 생기지만 `BUILD_ID`와 최종 route summary 없이 종료되는 점을 확인했다.

## 검증
- `pnpm build`
  - FAIL (`ELIFECYCLE`, stderr 추가 정보 없음)
- `env NEXT_DEBUG_BUILD=1 pnpm build`
  - FAIL (`Creating an optimized production build ...` 이후 종료)
- `node scripts/next_build_safe.mjs --webpack`
  - [검증 필요] heartbeat는 출력되지만 현재 세션에서는 `SIGTERM(143)`로 종료됐다.
- `env NEXT_DEBUG_BUILD=1 node scripts/next_build_safe.mjs --webpack`
  - FAIL (`compile` 단계에서 `SIGTERM(143)`)
- `setsid -f /bin/bash -lc 'node scripts/next_build_safe.mjs --webpack > /tmp/finance-build-detached.log 2>&1'`
  - [검증 필요] detached 실행 자체는 유지됐고 `.next-build/server/app-paths-manifest.json`, `server-reference-manifest.*`, `webpack-runtime.js`까지 생성됐지만 `BUILD_ID`와 성공 로그 없이 종료됐다.

## 남은 리스크
- `pnpm build` full PASS 근거는 아직 없다. 현재 워크트리에서는 compile 이후 일부 server 산출물까지 생성되지만 최종 성공 산출물과 종료 로그가 남지 않는다.
- detached build 로그에는 heartbeat 두 줄만 남고 에러 원문이 없다. 현재 정보만으로는 Next 내부 종료 원인과 저장소 코드 원인을 분리 확정하기 어렵다.
- `work/3/12/2026-03-12-data-sources-prod-smoke-support-summary.md`의 연쇄 리스크였던 `pnpm planning:v2:prod:smoke`도 build 성공 근거가 없어서 이번 라운드에서 닫지 못했다.
- 현재 워크트리가 매우 dirty 하므로, build 문제는 이번 조사 범위를 넘는 다른 미완료 변경과 결합돼 있을 가능성이 높다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
