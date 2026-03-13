# 2026-03-13 planning-v3 shared-bodytone-surface-cleanup

## 변경 파일
- `src/components/ui/BodyTone.tsx`
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
- `src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx`
- `src/app/planning/v3/import/_components/ImportCsvClient.tsx`
- `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- `work/3/13/2026-03-13-planning-v3-shared-bodytone-surface-cleanup.md`

## 사용 skill
- `planning-gate-selector`: shared UI helper + user-facing component 배치에서 `vitest + eslint + build + diff check`를 유지하는 최소 검증 세트를 고르는 데 사용
- `work-log-closeout`: shared BodyTone cleanup 라운드의 실제 수정 파일, build 재시도 경로, 실행/미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `shared BodyTone surface cleanup` 축이 어긋나므로, user-facing surface helper와 직접 consumer만 정리하고 route/API/parser/import contract로 넓히지 않게 제한했다.

## 변경 이유
- latest `legacy-drafts direct UI test hardening` note가 다음 우선순위로 `shared BodyTone surface cleanup`을 남겼다.
- 현재 dirty cluster는 `BodyTone.tsx`와 drafts/import/profile-drafts consumer들이 같은 helper primitive(`BodyActionLink`, `BodyInset`, `BodyTableFrame`, `BodySectionHeading`, `bodyFieldClassName`)로 수렴하는 방향이었다.
- audit 결과 dialog/table/empty state 쪽은 이미 공용 helper 기준으로 정리돼 있었고, 남은 불일치는 link-group contract와 일부 raw heading/file-input surface 정도였다.
- 그래서 이번 라운드는 공용 helper 계약 1개와 남아 있던 raw consumer surface만 최소로 맞췄다.

## action link / inset / table frame / dialog surface / field class 정리
- `src/components/ui/BodyTone.tsx`
  - `bodyActionLinkGroupClassName`를 tone/text-size가 아니라 layout-only(`flex flex-wrap items-center gap-3`) 역할로 좁혔다.
  - 이유: 실제 tone 책임은 `BodyActionLink`가 갖고 있었고, group helper가 text size를 같이 들고 있으면 consumer마다 중복 또는 무효 클래스가 생겼다.
- `src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
  - entry link 묶음을 raw class 대신 `bodyActionLinkGroupClassName`로 바꿨다.
  - file input도 `bodyFieldClassName`로 맞춰 upload entry surface가 다른 planning-v3 입력 표면과 같은 규칙을 따르도록 정리했다.
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
  - CSV file input만 `bodyFieldClassName`으로 맞췄다.
  - dialog/table/action-link 정리는 기존 dirty 상태 그대로 유지했다.
- `src/app/planning/v3/import/_components/ImportCsvClient.tsx`
  - `미리보기` 카드 header를 raw `h2 + status span`에서 `BodySectionHeading`으로 바꿨다.
  - preview card도 다른 summary cards와 같은 section heading primitive를 쓰도록 맞췄다.
- `src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
  - summary card heading을 `BodySectionHeading`으로 바꾸고, download row를 `bodyDenseActionRowClassName`으로 맞췄다.
- `src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx`
  - `초안 요약` heading을 `BodySectionHeading`으로 바꿨다.
- `src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
  - `Draft 메타` heading을 `BodySectionHeading`으로 바꿨다.

## audit-only로 유지한 consumer
- 아래 표면은 이번 라운드에서 읽고 확인만 했고 추가 수정은 하지 않았다.
  - `src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx`
  - `src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
  - `src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
  - `tests/planning-v3-legacy-drafts-ui.test.tsx`
  - `tests/planning-v3-import-csv-upload-ui.test.tsx`
  - `tests/planning-v3-profile-drafts-ui.test.tsx`
  - `tests/e2e/v3-draft-apply.spec.ts`
- 이유
  - dialog surface, table frame, empty-state surface, selector/CTA는 이미 현재 helper contract와 맞았고 이번 라운드에서 추가 조정 없이 설명 가능했다.

## narrow e2e / route guard 조건부 포함 여부
- narrow e2e
  - 열지 않았다.
  - 이유: selector/test id/href 의미는 바꾸지 않았고, direct UI tests 3종과 build만으로 shared helper import surface를 충분히 설명할 수 있었다.
- route guard
  - 열지 않았다.
  - 이유: canonical href 자체는 이번 라운드에서 바꾸지 않았다.

## 검증
- 기준선 확인
  - `sed -n '1,260p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,260p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,280p' work/3/13/2026-03-13-planning-v3-legacy-drafts-direct-ui-test-hardening.md`
- 상태 잠금 / audit
  - `git status --short -- src/components/ui/BodyTone.tsx src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx src/app/planning/v3/import/_components/ImportCsvClient.tsx src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts docs/current-screens.md`
  - `sed -n '1,260p' src/components/ui/BodyTone.tsx`
  - `git diff -- src/components/ui/BodyTone.tsx src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx src/app/planning/v3/import/_components/ImportCsvClient.tsx src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx`
  - `rg -n "BodyActionLink|BodyInset|BodyTableFrame|BodyDialogSurface|BodySectionHeading|BodyEmptyState|BodyStatusInset|bodyFieldClassName|bodyDenseActionRowClassName|bodyInlineActionLinkClassName|bodyActionLinkGroupClassName" src/app/planning/v3/drafts src/app/planning/v3/import src/app/planning/v3/profile -g '!src/app/api/**'`
  - `rg -n "next/link|window\\.confirm|rounded-xl border border-slate-200|rounded-md border border-slate|text-sm font-bold text-slate-900|underline underline-offset-2|overflow-x-auto rounded-xl border border-slate-200|rounded-2xl border border-dashed border-slate-200" src/app/planning/v3/drafts src/app/planning/v3/import src/app/planning/v3/profile src/components/ui/BodyTone.tsx -g '!src/app/api/**'`
  - `sed -n '70,130p' src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx`
  - `sed -n '880,980p' src/app/planning/v3/import/_components/ImportCsvClient.tsx`
  - `sed -n '200,290p' src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx`
  - `sed -n '150,240p' src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx`
  - `sed -n '396,470p' src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
- UI 테스트
  - `pnpm exec vitest run tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3-profile-drafts-ui.test.tsx`
  - PASS (`3 files`, `9 tests`)
- eslint
  - `pnpm exec eslint src/components/ui/BodyTone.tsx src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx src/app/planning/v3/import/_components/ImportCsvClient.tsx src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx src/app/planning/v3/profile/drafts/[id]/preflight/_components/ProfileDraftPreflightClient.tsx tests/planning-v3-legacy-drafts-ui.test.tsx tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3-profile-drafts-ui.test.tsx tests/e2e/v3-draft-apply.spec.ts`
  - PASS
- build
  - `pnpm build`
  - 1차 FAIL: `ENOTEMPTY: directory not empty, rmdir '/home/xpdlqj/code/finance/.next-build/standalone/.data/news/items'`
  - `pnpm cleanup:next-artifacts`
  - `node -e "require('fs').rmSync('.next-build/standalone/.data/news/items', { recursive: true, force: true })"`
  - `pnpm build`
  - PASS
- diff check
  - `git diff --check -- src/components/ui/BodyTone.tsx src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx src/app/planning/v3/import/_components/ImportCsvClient.tsx src/app/planning/v3/import/csv/_components/CsvBatchUploadClient.tsx src/app/planning/v3/profile/draft/_components/ProfileDraftFromBatchClient.tsx src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx work/3/13/2026-03-13-planning-v3-shared-bodytone-surface-cleanup.md`
  - PASS

## 미실행 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/v3-draft-apply.spec.ts --workers=1`
- `pnpm planning:current-screens:guard`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`

## 남은 리스크
- `BodyTone.tsx`는 여전히 untracked 상태라, 이번 helper contract가 안정적이라고 해도 이후 라운드에서는 tracked 정리 또는 별도 배치 관리가 필요하다.
- `pnpm build`는 최종 PASS였지만, 첫 시도에서는 `.next-build/standalone/.data/news/items` artifact 정리 문제로 막혔다. 다음 라운드에서도 같은 runtime artifact 상태가 반복되면 build 전 cleanup이 다시 필요할 수 있다.
- 이번 라운드는 selector/href 의미를 바꾸지 않아 narrow e2e를 다시 열지 않았다. visual surface 회귀를 실제 브라우저 상호작용까지 확인하려면 별도 좁은 e2e 배치가 필요하다.

## 이번 라운드 완료 항목
- shared helper와 consumer 사이에 남아 있던 raw action-link-group, raw file input, raw section heading surface를 정리했다.
- direct UI tests 3종과 build를 통해 shared BodyTone import/class contract가 현재 user-facing 표면에서 유지되는지 확인했다.
- route/API/parser/import contract는 다시 열지 않고 visual surface cleanup만 독립 배치로 마감했다.

## 다음 라운드 우선순위
1. 새 user-facing 회귀가 없으면 이번 `shared BodyTone surface cleanup` 범위는 재오픈하지 않는다.
2. 후속이 필요하면 `build artifact cleanup hardening` 또는 더 좁은 interaction/e2e surface 확인 배치를 별도로 자른다.
