# 2026-03-14 planning-v3 transactions-batches-import-user-facing-contract close plan

## 변경 파일
- `work/3/14/2026-03-14-planning-v3-transactions-batches-import-user-facing-contract-close-plan.md`

## 사용 skill
- `planning-gate-selector`: route 3개 + import UI 2개 + direct API/UI/e2e만 포함하는 최소 검증 세트를 고르는 데 사용
- `route-ssot-check`: `/planning/v3/import/csv`, `/planning/v3/drafts`와 관련 API/UI link가 실제 공개 경로와 맞는지 재확인하는 데 사용
- `work-log-closeout`: 이번 planning 라운드의 실제 조회 명령, 남은 리스크, 다음 우선순위를 `/work` 형식으로 남기는 데 사용

## 변경 이유
- 사용자 요청은 `planning-v3 transactions-batches-import-user-facing-contract` 배치를 다시 audit/close하기 위한 3~5단계 제안이었다.
- 범위는 route 3개 + import UI 2개 + direct API/UI/e2e로 고정됐고, 다른 축 확장은 금지됐다.
- 오늘 기존 note상 이 배치는 이미 한 차례 닫혀 있어, 이번 라운드에서는 최신 note와 route SSOT를 이어받아 재실행 순서만 좁게 정리하는 것이 맞다.

## 핵심 변경
- 오늘 최신 관련 note `work/3/14/2026-03-14-planning-v3-transactions-batches-import-user-facing-contract.md`를 읽고 기존 audit 결과와 검증 세트를 이어받았다.
- `docs/current-screens.md` 기준으로 공개 경로 `/planning/v3/import/csv`, `/planning/v3/drafts`가 여전히 실제 page surface와 맞는지 확인했다.
- import UI와 direct API surface에서 이번 batch에 묶인 경로가 `/api/planning/v3/import/csv`, `/api/planning/v3/batches/import/csv`, `/api/planning/v3/transactions/import/csv`, `/api/planning/v3/drafts` 축으로 응집돼 있음을 다시 확인했다.
- close 순서는 `정적 audit -> direct test/lint -> main build -> narrow e2e`로 두고, 전체 `pnpm e2e:rc`나 다른 planning-v3 축 재개방은 이번 범위에서 제외했다.

## 검증
- 실행한 조회
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-transactions-batches-import-user-facing-contract.md`
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/route-ssot-check/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `rg -n "/planning/v3/import|/planning/v3/drafts|/api/planning/v3/(import/csv|batches/import/csv|transactions/import/csv)" docs/current-screens.md src/app tests/e2e/flow-v3-import-to-cashflow.spec.ts tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts`
  - `rg --files src/app/planning/v3 | rg '/page\\.tsx$|/route\\.ts$'`
- 미실행 검증
  - `pnpm exec vitest run tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts`
  - `pnpm exec eslint src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts src/app/planning/v3/import/_components/ImportCsvClient.tsx src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts`
  - `pnpm build`
  - `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts --workers=1`

## 남은 리스크
- 이번 라운드는 planning only라 실제 gate 재실행 결과는 없다. close 판정 전에는 기존 note의 PASS를 재사용하지 말고 메인 에이전트가 최소 검증 세트를 다시 실행해야 한다.
- `/planning/v3/import`와 `/planning/v3/import/csv` naming 혼재, `/api/planning/v3/drafts`까지 이어지는 direct draft 생성 흐름은 이번 batch 범위에 포함되지만, profile/accounts/news 축으로 번지면 범위 위반이 된다.
- `tests/planning-v3-import-csv-upload-ui.test.tsx`는 markup 중심이라 hydration 상태 문구 차이까지는 보장하지 않는다.

## 다음 라운드 우선순위
1. 메인 에이전트가 direct API/UI test와 eslint를 먼저 재실행해 현재 dirty state 기준선부터 다시 잠근다.
2. 그다음 `pnpm build`와 narrow e2e 1건만 메인 소유로 돌려 close 여부를 판정한다.
3. PASS면 같은 범위 안에서 audit/close를 끝내고 다음 residue split으로 넘어간다.
