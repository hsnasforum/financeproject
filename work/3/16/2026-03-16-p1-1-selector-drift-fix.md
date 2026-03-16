# 2026-03-16 P1-1 selector drift fix

## 이번 배치 대상 항목 ID
- `P1-1`

## 변경 파일
- `src/components/PlanningWorkspaceClient.tsx`
- `work/3/16/2026-03-16-p1-1-selector-drift-fix.md`

## 핵심 변경
- planning workspace의 실행 내역 CTA에 legacy 호환 selector `planning-runs-link`와 `data-ready="true"`를 Link wrapper에 복구했다.
- 기존 quickstart selector `planning-quickstart-runs-link`와 `id`는 그대로 유지해 quickstart follow-through 포커스 흐름을 깨지 않게 했다.
- quickstart 상태 카드 문구를 `다음 ·`에서 `다음 단계 ·`로 보정해 현재 e2e 기대와 실제 안내 문장을 다시 맞췄다.
- `runStatusReviewRequired` 상태의 실행 내역 CTA는 기존 primary tone 대신 emerald CTA로 보정해 fallback spec이 기대하는 시각 상태를 회복했다.
- 이번 라운드에서는 `P1-1` 상태를 올리지 않았고, planning workspace drift 1건만 정리했다.

## 실행한 검증
- `git diff -- src/components/PlanningWorkspaceClient.tsx`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-planner-to-history.spec.ts tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
- `git diff --check -- src/components/PlanningWorkspaceClient.tsx work/3/16/2026-03-16-p1-1-selector-drift-fix.md`

## 남은 리스크
- `P1-1` 전체 blocker는 아직 남아 있다. 이번 배치는 planning workspace selector/copy/style drift 1건만 줄인 것이다.
- `recommend` smoke, `data-sources`, `DART`, `news settings` 관련 실패는 이번 라운드에서 손대지 않았다.
- `analysis_docs/v2/financeproject_next_stage_plan.md` 상태 메모는 현재도 `[진행중]` 유지가 맞지만, closeout 근거 문구 보강은 별도 문서 라운드로 미뤘다.

## 다음 우선순위
- `P1-1` 후속 2순위였던 `recommend` smoke의 selector/API 흔적을 좁게 재현할지 결정
- 그 다음 후보로 `data-sources-settings` copy drift를 별도 1건으로 분리할지 검토

## 사용한 skill
- `planning-gate-selector`: 전체 RC 재실행 대신 planning workspace 관련 spec만 좁게 재현하는 검증 범위를 고정하는 데 사용.
- `work-log-closeout`: 이번 후속 1건의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용.
