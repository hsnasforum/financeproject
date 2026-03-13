# 2026-03-14 planning-v3 transactions-batches-import-user-facing-contract

## 변경 파일
- 코드 추가 수정 없음
- close 범위로 다시 잠근 dirty subset
  - `src/app/api/planning/v3/import/csv/route.ts`
  - `src/app/api/planning/v3/batches/import/csv/route.ts`
  - `src/app/api/planning/v3/transactions/import/csv/route.ts`
  - `src/app/planning/v3/import/_components/ImportCsvClient.tsx`
  - `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
  - `tests/planning-v3-batches-import-csv-api.test.ts`
  - `tests/planning-v3-transactions-import-account-api.test.ts`
  - `tests/planning-v3-import-csv-upload-ui.test.tsx`
  - `tests/planning-v3/drafts-upload-flow.test.ts`
  - `tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- `work/3/14/2026-03-14-planning-v3-transactions-batches-import-user-facing-contract.md`

## 사용 skill
- `planning-gate-selector`: 이번 배치를 route 3개 + import UI 2개 + direct API/UI/e2e batch로 다시 분류하고 `vitest -> eslint -> build -> narrow e2e -> diff check` 검증 세트를 잠그는 데 사용
- `route-ssot-check`: import entry CTA가 가리키는 `/planning/v3/import/csv`, `/planning/v3/batches`, `/planning/v3/batches/[id]`, `/planning/v3/drafts`, `/planning/v3/profile/drafts`, `/planning/v3/transactions`, `/planning/v3/transactions/batches` 경로가 `docs/current-screens.md`와 어긋나지 않는지 확인하는 데 사용
- `work-log-closeout`: rerun audit 결과, 실행한 검증, 남은 리스크, 다음 우선순위를 오늘 `/work` note 형식으로 남기는 데 사용

## 변경 이유
- latest note `work/3/14/2026-03-14-planning-v3-draft-profile-drafts-route-contract.md`가 다음 실제 구현 1순위로 `transactions/batches/import user-facing contract`를 남겼다.
- current dirty subset도 import route 3개, import UI 2개, direct API/UI/e2e tests로 계속 응집돼 있어 same-origin / CSRF / payload / CTA / empty-help surface만 따로 재확인하기 적합했다.
- 이미 닫힌 accounts/profile remote-host contract, draft/profile-drafts route contract, news 하위 배치, runtime 축은 이번 라운드에서 다시 열지 않았다.

## 핵심 변경
- audit 결과, 이번 batch 범위의 current dirty diff는 이미 목적과 맞게 정렬돼 있었고 추가 코드 수정은 필요하지 않았다.
- `src/app/api/planning/v3/import/csv/route.ts`, `src/app/api/planning/v3/batches/import/csv/route.ts`, `src/app/api/planning/v3/transactions/import/csv/route.ts`는 same-origin / CSRF / payload contract를 현재 direct API tests 기대와 일치하게 유지하고 있었다.
- `src/app/planning/v3/import/_components/ImportCsvClient.tsx`와 `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`의 CTA / empty-help / 저장 진입 surface도 현재 route 계약과 어긋나지 않았다. 기존 close에서 맞췄던 `preview -> /api/planning/v3/import/csv?csrf=... + x-csrf-token`, `CSV 배치로 저장`, `배치 목록 보기`, `초안 목록`, `실패 요약이 없습니다.` 계약이 그대로 유지됐다.
- `tests/planning-v3/drafts-upload-flow.test.ts`와 `tests/e2e/flow-v3-import-to-cashflow.spec.ts`는 import -> preview/save/list/transaction 반영의 핵심 동선을 여전히 직접 고정하고 있었다.
- 조건부 포함으로 `src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`, `src/lib/planning/v3/providers/csv/csvProvider.ts`, `src/lib/planning/v3/service/importCsvToDraft.ts`는 열지 않았다.
- route SSOT 확인 결과 import surface가 쓰는 공개 경로는 모두 `docs/current-screens.md`와 맞았고 문서 수정은 필요하지 않았다.

## 검증
- 기준선 / audit
  - `sed -n '1,220p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,220p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,220p' .codex/skills/route-ssot-check/SKILL.md`
  - `sed -n '1,220p' work/3/14/2026-03-14-planning-v3-draft-profile-drafts-route-contract.md`
  - `git status --short -- src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts src/app/planning/v3/import/_components/ImportCsvClient.tsx src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts`
  - `sed -n '1,240p' work/3/14/2026-03-14-planning-v3-transactions-batches-import-user-facing-contract.md`
  - `nl -ba src/app/api/planning/v3/import/csv/route.ts | sed -n '1,320p'`
  - `nl -ba src/app/api/planning/v3/batches/import/csv/route.ts | sed -n '1,260p'`
  - `nl -ba src/app/api/planning/v3/transactions/import/csv/route.ts | sed -n '1,260p'`
  - `nl -ba src/app/planning/v3/import/_components/ImportCsvClient.tsx | sed -n '1,360p'`
  - `nl -ba src/app/planning/v3/import/_components/ImportCsvClient.tsx | sed -n '360,780p'`
  - `nl -ba src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx | sed -n '1,260p'`
  - `nl -ba tests/planning-v3-import-csv-upload-ui.test.tsx | sed -n '1,240p'`
  - `nl -ba tests/planning-v3-batches-import-csv-api.test.ts | sed -n '1,320p'`
  - `nl -ba tests/planning-v3-transactions-import-account-api.test.ts | sed -n '1,360p'`
  - `nl -ba tests/planning-v3/drafts-upload-flow.test.ts | sed -n '1,260p'`
  - `nl -ba tests/e2e/flow-v3-import-to-cashflow.spec.ts | sed -n '1,260p'`
  - `rg -n "/planning/v3/import/csv|/planning/v3/transactions/batches|/planning/v3/drafts|/planning/v3/batches|/planning/v3/profile/drafts|/planning/v3/transactions" docs/current-screens.md src/app/planning/v3/import/_components/ImportCsvClient.tsx src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-import-csv-upload-ui.test.tsx tests/e2e/flow-v3-import-to-cashflow.spec.ts`
- 실행한 검증
  - `pnpm exec vitest run tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts`
  - PASS (`4 files`, `13 tests`)
  - `pnpm exec eslint src/app/api/planning/v3/import/csv/route.ts src/app/api/planning/v3/batches/import/csv/route.ts src/app/api/planning/v3/transactions/import/csv/route.ts src/app/planning/v3/import/_components/ImportCsvClient.tsx src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-batches-import-csv-api.test.ts tests/planning-v3-transactions-import-account-api.test.ts tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts tests/e2e/flow-v3-import-to-cashflow.spec.ts`
  - PASS
  - `pnpm build`
  - PASS
  - `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-v3-import-to-cashflow.spec.ts --workers=1`
  - PASS (`1 passed`)
- 미실행 검증
  - 전체 `pnpm test`
  - 전체 `pnpm lint`
  - `pnpm e2e:rc`
  - `pnpm release:verify`

## 남은 리스크
- 이번 라운드는 current dirty subset을 그대로 close한 것이므로, import entry client의 direct batch 저장 경로 `/api/planning/v3/transactions/batches/import-csv`와 route naming alignment 자체는 별도 follow-up으로 남는다.
- `tests/planning-v3-import-csv-upload-ui.test.tsx`는 static markup 중심이라 hydration 이후의 세부 상태 문구 변화까지 직접 고정하지는 않는다.

## 다음 라운드 우선순위
1. [가정] planning-v3 residue re-scan and next-batch split
