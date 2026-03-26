# 2026-03-26 v3 import-to-planning beta reports-dashboard saved-detail handoff alignment implementation

## 변경 파일
- `src/components/PlanningReportsDashboardClient.tsx`
- `tests/e2e/flow-history-to-report.spec.ts`
- `work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-saved-detail-handoff-alignment-implementation.md`

## 사용 skill
- `planning-gate-selector`: href/query 영향이 있는 reports dashboard 배치라 `planning:current-screens:guard`, narrow e2e, `lint`, `build`, `e2e:rc` 순서를 고르는 데 사용.
- `route-ssot-check`: `/planning/reports` dashboard에서 `/planning/reports/[id]` secondary CTA를 추가해도 SSOT상 documented stable route만 가리키는지 확인하는 데 사용.
- `work-log-closeout`: `/work` 종료 기록 형식과 미실행 검증 표기를 현재 저장소 규칙에 맞추는 데 사용.

## 변경 이유
- `/planning/runs -> /planning/reports?runId=...` valid handoff까지는 닫혔지만, `/planning/reports` dashboard 안에서는 `저장된 리포트로 보관` 성공 뒤 saved detail(`/planning/reports/[id]`)로 이어지는 보조 handoff가 비어 있었다.
- `selected` query는 저장 성공 시 갱신되고 있었지만 dashboard UI가 그 상태를 읽지 않아, saved detail tier가 실제 제품 흐름상 한 단계 더 숨어 있었다.

## 핵심 변경
- `PlanningReportsDashboardClient`에서 `selected` query를 `savedReportId` 상태로 연결하고, `/planning/reports/[id]` secondary CTA href를 실제로 계산하도록 바꿨다.
- `저장된 리포트로 보관` 성공 notice 안에 `저장된 상세 리포트 열기` secondary CTA와 helper copy를 추가해, `/planning/reports`는 기본 destination, `/planning/reports/[id]`는 저장 상세 tier라는 분리를 유지한 채 handoff를 닫았다.
- 새 CTA는 save 직후 local state로 즉시 보이고, 새로고침 후에도 `selected=<savedReportId>` query가 남아 있으면 같은 보조 handoff를 다시 노출한다.
- `flow-history-to-report` e2e에 `저장된 리포트로 보관 -> selected query 기록 -> 저장된 상세 리포트 열기 -> /planning/reports/[id]` 검증을 추가했다.
- report detail e2e는 cold compile 구간까지 감안해 timeout을 60초로 좁게 늘렸다.
- narrow e2e 첫 실패로 `.data/planning-e2e`에 남은 seed profile 3개가 quickstart preview를 오염시켜 `pnpm e2e:rc`를 깨뜨린 것을 확인했고, e2e 전용 data root에서 해당 profile/runs index만 정리한 뒤 같은 명령을 재실행해 PASS를 확인했다.

## 검증
- `pnpm planning:current-screens:guard` → PASS
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → 1차 FAIL
  - `PlanningReportsDashboardClient.tsx`의 `saveReportDetailHref` 오타로 실패, 수정 후 재실행
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → 2차 FAIL
  - 마지막 detail e2e가 cleanup 전에 timeout 여유 부족으로 끊겨 `test.setTimeout(60_000)` 추가 후 재실행
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-history-to-report.spec.ts --workers=1` → PASS
- `pnpm lint` → PASS
  - 기존 warning 24건 유지, 새 error 없음
- `pnpm build` → PASS
- `pnpm e2e:rc` → 1차 FAIL
  - earlier failed narrow e2e가 남긴 `.data/planning-e2e` seed profile 3개 때문에 `planning-quickstart-preview.spec.ts`가 `월 실수령 4,100,000원`을 읽음
- `node - <<'NODE' ...` → e2e 전용 data root `.data/planning-e2e`에서 leaked seed profile 3개와 해당 runs index entry 정리
- `pnpm e2e:rc` → PASS
- `git diff --check -- src/components/PlanningReportsDashboardClient.tsx src/app/planning/reports/page.tsx src/components/PlanningReportDetailClient.tsx tests/e2e/flow-history-to-report.spec.ts tests/e2e/planning-v2-fast.spec.ts tests/planning-reports-page-fallback.test.tsx work/3/26/2026-03-26-v3-import-to-planning-beta-reports-dashboard-saved-detail-handoff-alignment-implementation.md` → PASS
- `[미실행] pnpm planning:ssot:check`
  - route policy/catalog 자체는 바꾸지 않았고, documented stable route 사이의 secondary href만 추가해 `planning:current-screens:guard`까지만 실행
- `[미실행] tests/planning-reports-page-fallback.test.tsx`
  - 이번 라운드는 dashboard client의 save handoff와 e2e 흐름만 건드려 SSR fallback fixture는 다시 열지 않음
- `[미실행] tests/planning/reports/reportDashboardOverrides.test.tsx`
  - override disclosure나 report VM 조합을 건드리지 않아 이번 라운드 범위 밖으로 유지
- `[미실행] tests/e2e/planning-v2-fast.spec.ts`
  - representative handoff는 `flow-history-to-report.spec.ts`와 `pnpm e2e:rc` 안에서 이미 커버됨

## 남은 리스크
- dashboard는 `selected` query에 saved report id가 있으면 secondary CTA를 바로 노출하지만, 사용자가 수동으로 stale `selected` 값을 넣은 경우 링크는 detail route 404/로드 실패를 통해서만 이상을 드러낸다.
- `pnpm e2e:rc` 1차 실패는 코드 회귀가 아니라 earlier failed narrow e2e가 `.data/planning-e2e`를 오염시킨 케이스였다. 같은 종류의 중단이 반복되면 quickstart preview가 다시 polluted state에 민감할 수 있다.
