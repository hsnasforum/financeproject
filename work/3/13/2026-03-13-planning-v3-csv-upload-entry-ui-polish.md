# 2026-03-13 planning-v3 csv-upload-entry-ui-polish

## 변경 파일
- `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
- `tests/planning-v3-import-csv-upload-ui.test.tsx`
- `work/3/13/2026-03-13-planning-v3-csv-upload-entry-ui-polish.md`

## 사용 skill
- `planning-gate-selector`: user-facing component/UI text 배치에 맞춰 `vitest + eslint + diff check`까지만 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: csv upload entry UI audit 결과, 조건부 포함 여부, 실행/미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `csv upload entry UI polish` 축이 어긋나므로, `CsvBatchUploadClient.tsx`와 direct UI test만 잠그고 parser/import route/drafts flow로 번지지 않게 제한했다.

## 변경 이유
- latest `drafts upload-flow compatibility hardening` note가 다음 우선순위로 `csv upload entry UI polish`만 남겼다.
- 현재 direct UI dirty는 `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx` 1파일에 모여 있었고, diff 성격도 `next/link` -> `BodyActionLink`로 좁았다.
- component swap 자체는 이미 되어 있었지만, direct UI test는 test id만 확인하고 있어 `Batch Center`, `Draft 목록`의 href/text 의미까지는 고정하지 못하고 있었다.
- 따라서 이번 라운드는 component diff를 유지한 채 direct UI test만 최소 보강해 body-tone link surface와 동선 의미를 함께 잠그는 것이 가장 작은 처리였다.

## 핵심 변경
- `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
  - 기존 `next/link`를 `BodyActionLink`로 바꾼 current diff를 유지했다.
  - href는 그대로 유지했다.
    - `/planning/v3/batches`
    - `/planning/v3/profile/drafts`
  - card 안 링크 표면을 shared body-tone component로 정렬해 다른 planning body surface와 tone을 맞췄다.
- `tests/planning-v3-import-csv-upload-ui.test.tsx`
  - 기존 test id assertion은 유지했다.
  - 아래 UI entry contract를 추가로 고정했다.
    - `href="/planning/v3/batches"` + `Batch Center`
    - `href="/planning/v3/profile/drafts"` + `Draft 목록`
- 결론적으로 이번 배치는 style/component swap이 맞았고, direct UI test에 링크 의미를 추가하는 최소 보강만 필요했다.

## 링크 tone/body surface에서 실제로 조정한 내용
- 링크 tone
  - entry 카드 안 두 링크를 `BodyActionLink`로 통일했다.
  - inline `underline underline-offset-2` 개별 class 대신 shared body-tone link surface를 사용한다.
- body surface
  - 페이지 내 핵심 upload control card와 같은 body tone 계열 링크로 읽히도록 정리했다.
  - href와 링크 텍스트 의미 자체는 바꾸지 않았다.

## 조건부 포함 여부
- `src/components/ui/BodyTone.tsx`
  - 열었다.
  - `BodyActionLink`가 `text-sm font-semibold text-emerald-700 underline underline-offset-2` 기반 shared surface임을 확인하려고 최소 범위로만 읽었다.
  - 수정은 하지 않았다.
- `src/app/planning/v3/import/csv/page.tsx`
  - 열지 않았다.
  - component direct import와 UI test만으로 현재 계약 설명이 충분했고, page shell까지 넓힐 이유가 없었다.

## 검증
- 기준선 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-drafts-upload-flow-compatibility-hardening.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-csv-parser-determinism-hardening.md`
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-csv-drafts-residue-next-batch-breakdown.md`
- 상태 잠금 / audit
  - `git status --short -- src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-import-csv-upload-ui.test.tsx src/components/ui/BodyTone.tsx src/app/planning/v3/import/csv/page.tsx`
  - `git diff -- src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-import-csv-upload-ui.test.tsx`
  - `sed -n '1,240p' src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
  - `sed -n '1,220p' tests/planning-v3-import-csv-upload-ui.test.tsx`
  - `sed -n '1,200p' src/components/ui/BodyTone.tsx`
- 테스트
  - `pnpm exec vitest run tests/planning-v3-import-csv-upload-ui.test.tsx`
  - PASS (`1 file`, `1 test`)
- eslint
  - `pnpm exec eslint src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx tests/planning-v3-import-csv-upload-ui.test.tsx`
  - PASS

## 미실행 검증
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- 이번 라운드는 static markup 기준으로 링크 텍스트와 href를 고정했다. 클릭 상호작용이나 업로드 제출 동작 자체는 이 UI batch에서 다시 넓히지 않았다.
- `src/components/ui/BodyTone.tsx`가 현재 worktree에서 untracked 상태라, 이후 body tone 공용 surface를 따로 정리할 때는 별도 batch로 다루는 편이 안전하다. 이번 라운드에서는 import 대상 확인만 했다.
- parser semantics, import route contract, drafts flow compatibility는 의도적으로 제외했다. 이후 csv 관련 변경이 생겨도 entry UI polish batch와 섞지 않는 편이 안전하다.

## 다음 라운드 우선순위
1. 이번 `csv upload entry UI polish` 범위는 재오픈하지 않는다.
