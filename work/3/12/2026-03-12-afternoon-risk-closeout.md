# 2026-03-12 오후 리스크 정리 closeout

## 변경 파일
- `playwright.config.ts`
- `scripts/planning_v2_complete.mjs`
- `src/components/PlanningReportsDashboardClient.tsx`
- `src/lib/planning/store/runActionStore.ts`
- `tests/e2e/planning-v2-fast.spec.ts`
- `tests/e2e/planning-v2-full.spec.ts`
- `tests/planning-v2-api/run-action-progress-route.test.ts`
- `README.md`
- `docs/release.md`

## 사용 skill
- `planning-gate-selector`: planning report client, release gate, e2e, build 영향이 함께 있는 변경에서 최소 검증 세트를 다시 고르는 데 사용했다.
- `work-log-closeout`: 오후 `/work` 문서 재점검 결과와 실제 검증 근거를 현재 저장소 형식으로 정리하는 데 사용했다.

## 변경 이유
- 오후 `/work` 문서들을 다시 확인한 결과, 현재 시점에 실제로 다시 열려 있던 항목은 세 갈래였다.
- `planning-release-verify-hardening-closeout.md`의 남은 메모였던 compat/release 전용 JSON parse 경로와 advanced/raw 토글 비결정성.
- `planning-fast-origin-and-redirect-guard.md`, `planner-legacy-redirect-and-e2e-guard-closeout.md`, `global-scan-build-trace-warning.md`에 남아 있던 e2e/release 최종 PASS 재확인.
- build 관련 오후 메모들에 남아 있던 Codex foreground `pnpm build` follow-up이 현재 환경에서도 실제로 남는지 재확인.

## 핵심 변경
- `planning:v2:complete`가 `planning:v2:e2e:fast`를 전용 포트와 전용 planning data dir로 격리 실행하고, `PLAYWRIGHT_REUSE_EXISTING_SERVER=0`을 강제하도록 보강했다.
- Playwright webServer 설정이 `PLAYWRIGHT_REUSE_EXISTING_SERVER`를 읽어 release/compat 게이트에서 기존 dev 서버 재사용을 끌 수 있게 했다.
- reports advanced/raw 토글에 hydration 이후 준비 상태(`interactiveReady`, `data-ready`)를 추가하고, e2e는 이 신호가 올라온 뒤에만 클릭하도록 맞췄다.
- run action store가 `action-plan.json`, `action-progress.json`의 손상 JSON(`SyntaxError`)을 `ENOENT`와 같은 복구 가능 상태로 처리하도록 바꿨다.
- 손상 action center JSON 회복 케이스를 API 회귀 테스트로 추가하고, release 문서에는 fast e2e 격리 실행 규칙을 남겼다.
- 현재 Codex exec 환경에서 `pnpm release:verify`와 `pnpm build`를 모두 다시 통과시켜 오후 메모의 release/e2e/build follow-up을 실제 실행 근거로 닫았다.

## 검증
- `pnpm exec eslint playwright.config.ts scripts/planning_v2_complete.mjs src/lib/planning/store/runActionStore.ts src/components/PlanningReportsDashboardClient.tsx tests/e2e/planning-v2-fast.spec.ts tests/e2e/planning-v2-full.spec.ts tests/planning-v2-api/run-action-progress-route.test.ts`
  - PASS
- `pnpm test tests/planning-v2-api/run-action-progress-route.test.ts`
  - PASS
- `pnpm planning:v2:e2e:fast`
  - PASS (`5 passed`)
- `pnpm release:verify`
  - PASS
  - 내부에서 `pnpm test`, `pnpm planning:v2:complete`, `pnpm multi-agent:guard`, `pnpm planning:v2:compat`, `pnpm planning:v2:regress`, `pnpm planning:v2:e2e:full`, `pnpm planning:ssot:check`까지 통과
- `pnpm build`
  - PASS
  - 현재 Codex exec 환경에서도 foreground build가 최종 성공까지 완료됨

## 미실행 검증
- `docs/planning-v2-5min-selftest.md` 기준 수동 5분 self-test는 별도 수행하지 않았다.
- 다만 `pnpm release:verify` 내부 `planning:v2:e2e:full`과 별도 `pnpm build`까지 통과해, 이번 라운드의 오후 메모 대상 release/e2e/build 리스크 확인에는 추가 blocker가 남지 않았다.

## 남은 리스크
- 이번 요청 범위에서 확인한 오후 `/work` 메모의 release/e2e/build 축 미해결 blocker는 현재 없다.
- 저장소 전체 워크트리는 여전히 매우 dirty 하므로, 다음 보수 라운드도 작은 batch 단위로 유지하는 편이 안전하다.
- 수동 5분 self-test는 운영 판단 차원의 추가 확인이지, 이번 라운드의 자동 게이트 blocker는 아니다.

## 이번 라운드 완료 항목
1. compat/release에서 남던 `/planning` 손상 JSON read 경로 복구
2. `report-advanced-toggle` hydration race 제거와 e2e 대기 기준 고정
3. `release:verify`와 `pnpm build` 재통과로 오후 메모의 release/e2e/build follow-up 종료

## 다음 라운드 우선순위
1. `global-scan-build-trace-warning.md` 메모대로 다른 ops log store의 rotation helper 패턴을 같은 기준으로 한 번 더 훑기
2. `multi-agent-followup-and-priority-refresh.md` 메모대로 `/work` 디렉터리 장기 관리 정책을 별도 라운드에서 정리할지 결정
3. 운영상 필요하면 `docs/planning-v2-5min-selftest.md` 기반 수동 self-test를 release 직전 점검 체크리스트로 실행
