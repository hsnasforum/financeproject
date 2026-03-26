# 2026-03-26 v3 plan1 roadmap doc sync

## 변경 파일
- `plandoc/v3plan1.md`
- `work/3/26/2026-03-26-v3-plan1-roadmap-doc-sync.md`

## 사용 skill
- `planning-gate-selector`: docs-only 계획 문서 라운드에 맞는 최소 검증 세트를 고르기 위해 사용
- `work-log-closeout`: 오늘 라운드의 변경 파일, 실제 재실행 검증, 남은 리스크를 `/work` 형식으로 정리하기 위해 사용

## 변경 이유
- 최신 `/work`와 `analysis_docs/v3` 기준으로 representative funnel, Stream B, Stream C의 현재 위치가 흩어져 있어 한 장으로 읽히는 전체 계획 문서가 필요했다.
- 사용자는 다음 단계뿐 아니라 앞으로 진행할 `analysis_docs/v3` 전체 단계를 `plandoc/v3plan1.md`에 완료 기준까지 포함해 정리해 두길 원했다.

## 핵심 변경
- `plandoc/v3plan1.md`를 새로 만들고 v3 전체 계획을 `Stage 1. Product Flow Baseline`, `Stage 2. Stream B. Contract & QA`, `Stage 3. Stream C. Ops & Readiness`, `Stage 4. Promotion / Exposure` 4단계로 정리했다.
- representative funnel closeout 상태, current official next axis, Stream B proof set, Stream C deferred 범위를 한 문서에서 바로 읽히게 정리했다.
- 각 단계별 완료 기준과 체크리스트를 따로 적어 “무엇이 닫히면 다음 단계로 넘어가는지”를 명확히 남겼다.
- immediate next step은 `Stream B closeout -> Stream C baseline execution audit` 순서로 정리했다.
- broad route promotion, IA 재설계, `/planning/v3/start` 즉시 승격 같은 비범위 항목도 함께 잠갔다.

## 검증
- `git diff --check -- tests/e2e/v3-draft-apply.spec.ts work/3/26/2026-03-26-v3-import-to-planning-beta-targeted-gate-evidence-bundle-baseline-execution-audit.md`
  PASS
- `pnpm lint`
  PASS, 기존 warning 24건 유지
- `pnpm test`
  PASS, `Test Files 642 passed`, `Tests 1978 passed`
- `pnpm build`
  PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
  PASS, `3 passed`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
  PASS, `3 passed`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1`
  PASS, `9 passed`
- `git diff --check -- plandoc/v3plan1.md work/3/26/2026-03-26-v3-plan1-roadmap-doc-sync.md`
  PASS
- `[미실행] pnpm planning:current-screens:guard`
  - 이번 새 변경은 docs-only 계획 문서 추가라 route inventory/href 영향이 없어 다시 실행하지 않음
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog 자체를 건드리지 않아 실행하지 않음
- `[미실행] pnpm e2e:rc`
  - 이번 새 변경은 문서 추가만이라 full regression을 다시 돌리지 않음
- `[미실행] pnpm v3:doctor`
  - Stream C 공식 축으로 남아 있어 아직 baseline execution 전
- `[미실행] pnpm v3:export`
  - Stream C 공식 축으로 남아 있어 아직 baseline execution 전
- `[미실행] pnpm v3:restore`
  - Stream C 공식 축으로 남아 있어 아직 baseline execution 전
- `[미실행] pnpm v3:support-bundle`
  - Stream C 공식 축으로 남아 있어 아직 baseline execution 전

## 남은 리스크
- `plandoc/v3plan1.md`는 현재 `/work`와 `analysis_docs/v3` closeout chain을 한 장으로 요약한 문서라, 이후 Stream B closeout sync나 Stream C baseline execution이 추가되면 다시 한 번 동기화가 필요하다.
- targeted proof set은 이번 턴 기준으로 다시 PASS 확인됐지만, `Stream B`를 문서상 완전히 닫았다고 보려면 별도 closeout memo가 하나 더 있으면 가장 깔끔하다.
- `Stream C. Ops & Readiness`는 아직 실제 baseline execution이 없으므로, 현재 전체 계획의 다음 실제 작업은 그 쪽으로 넘어가는 편이 맞다.
