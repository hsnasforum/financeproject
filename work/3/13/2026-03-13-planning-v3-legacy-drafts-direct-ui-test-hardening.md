# 2026-03-13 planning-v3 legacy-drafts direct-ui-test hardening

## 변경 파일
- `src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx`
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
- `tests/planning-v3-legacy-drafts-ui.test.tsx`
- `work/3/13/2026-03-13-planning-v3-legacy-drafts-direct-ui-test-hardening.md`

## 사용 skill
- `planning-gate-selector`: direct UI regression coverage 배치에 맞춰 `vitest + eslint + diff check`만 고르는 데 사용
- `work-log-closeout`: test-only 중심 라운드의 실제 수정 범위와 실행/미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `legacy-drafts direct UI test` 축이 어긋나므로, shared BodyTone cleanup, route/API/parser/import/profile-drafts preflight/apply로 넓히지 않고 regression coverage 공백만 메우는 범위로 제한했다.

## 변경 이유
- latest `legacy-drafts list/detail user-facing` note가 남긴 다음 우선순위는 direct UI regression coverage 보강이었다.
- 현재 저장소에는 `legacy drafts list -> draft detail -> profile draft entry`를 직접 고정하는 UI test가 없었고, 이 공백 때문에 body-surface/CTA/confirm/href 변화가 다시 흔들릴 위험이 있었다.
- 현재 테스트 런타임에는 `jsdom`/`@testing-library/react`가 없어 상호작용 기반 검증으로 바로 가지 못했다.
- 그래서 `profile-drafts` 쪽과 같은 방식으로 server-render seam만 아주 얕게 추가하고, 새 static UI test 1개로 핵심 CTA/selector/confirm surface를 고정했다.

## 핵심 변경
- `tests/planning-v3-legacy-drafts-ui.test.tsx`
  - 새 direct UI test 파일을 추가했다.
  - `DraftsListClient`에서 `Profile 초안 생성`, `상세`, row selector, `초안 삭제 확인` dialog surface를 고정한다.
  - `DraftDetailClient`에서 `목록으로 돌아가기`, `Merged Profile 미리보기`, diff inset 안내 문구를 고정한다.
  - `ProfileDraftClient`에서 `배치 목록`과 `저장된 Draft 목록` CTA href를 고정한다.
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
  - runtime 동작은 유지하면서 `initialRows`, `disableAutoLoad`, `initialDeleteTargetId` test seam을 추가했다.
  - 삭제 dialog surface에 `data-testid="v3-draft-delete-dialog"`를 추가해 static direct test에서 안정적으로 확인할 수 있게 했다.
- `src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx`
  - runtime 동작은 유지하면서 `initialDraft`, `initialProfiles`, `disableAutoLoad` test seam을 추가했다.
  - static direct test에서 detail summary와 merged preview surface를 fetch 없이 바로 렌더링할 수 있게 했다.

## 새 test가 고정하는 CTA / selector / confirm 흐름
- drafts list
  - `data-testid="v3-drafts-list"`
  - `data-testid="v3-draft-row-draft-1"`
  - `href="/planning/v3/drafts/profile"` + `Profile 초안 생성`
  - `href="/planning/v3/drafts/draft-1"` + `상세`
  - `data-testid="v3-draft-delete-dialog"` + `초안 삭제 확인`
- draft detail
  - `href="/planning/v3/drafts"` + `목록으로 돌아가기`
  - `data-testid="v3-draft-summary"`
  - `Merged Profile 미리보기`
  - `data-testid="v3-draft-diff"`
- profile draft entry
  - `data-testid="v3-profile-draft-generate"`
  - `href="/planning/v3/transactions/batches"` + `배치 목록`
  - `href="/planning/v3/drafts"` + `저장된 Draft 목록`

## component 조건부 포함 여부
- 열었다.
- 이유
  - direct legacy-drafts UI test 파일이 없었고, 현재 런타임에는 `jsdom`/`@testing-library/react`가 없어 상호작용 테스트를 바로 추가할 수 없었다.
  - 따라서 server-render 기반 direct test를 만들기 위해 fetch 없는 초기 상태 주입 seam만 최소로 추가했다.
- 열지 않은 것
  - `src/components/ui/BodyTone.tsx`
  - `docs/current-screens.md`
  - `src/app/planning/v3/import/_components/ImportCsvClient.tsx`
  - `src/app/api/planning/v3/**`

## 검증
- 기준선 확인
  - `sed -n '1,260p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,260p' .codex/skills/work-log-closeout/SKILL.md`
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-legacy-drafts-list-detail-user-facing-followup.md`
- 상태 잠금 / audit
  - `git status --short -- src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx tests/planning-v3-drafts-ui.test.tsx docs/current-screens.md`
  - `sed -n '1,260p' tests/planning-v3-profile-drafts-ui.test.tsx`
  - `sed -n '1,220p' tests/planning-v3-import-csv-upload-ui.test.tsx`
  - `cat package.json`
  - `cat vitest.config.ts`
  - `node -p "try { require.resolve('jsdom') } catch (error) { 'MISSING' }"`
  - `node -p "try { require.resolve('@testing-library/react') } catch (error) { 'MISSING' }"`
  - `node -p "try { require.resolve('react-dom/test-utils') } catch (error) { 'MISSING' }"`
  - `sed -n '1,260p' src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
  - `sed -n '1,260p' src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx`
  - `sed -n '1,260p' src/app/planning/v3/profile/drafts/_components/ProfileDraftsListClient.tsx`
  - `sed -n '1,320p' src/app/planning/v3/profile/drafts/[id]/_components/ProfileDraftDetailClient.tsx`
  - `sed -n '1,240p' src/app/planning/v3/drafts/_components/draftsUploadFlow.ts`
- UI 테스트
  - `pnpm exec vitest run tests/planning-v3-legacy-drafts-ui.test.tsx`
  - PASS (`1 file`, `3 tests`)
- eslint
  - `pnpm exec eslint src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx tests/planning-v3-legacy-drafts-ui.test.tsx`
  - PASS

## 미실행 검증
- `pnpm planning:current-screens:guard`
  - href 자체는 이번 라운드에서 바뀌지 않았고, 직전 legacy-drafts note에서 이미 canonical route 검증이 끝나 있어 다시 실행하지 않았다.
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`

## 남은 리스크
- 삭제 confirm은 이번 라운드에서 static seam으로 dialog surface를 고정했다. 실제 클릭 상호작용까지 보장하는 테스트는 `jsdom` 기반 infra가 생기거나 별도 narrow browser test를 열어야 한다.
- `DraftsListClient`와 `DraftDetailClient`의 새 seam은 테스트 목적의 초기 상태 주입용이다. 기본 runtime 경로는 그대로지만, 다음 라운드에서 이 seam이 더 커지지 않게 유지하는 편이 안전하다.
- `BodyTone.tsx`와 `docs/current-screens.md`는 별도 dirty surface다. 이번 라운드에서는 회귀 커버리지에 필요한 전제만 사용했고, cleanup/diff 정리는 하지 않았다.

## 이번 라운드 완료 항목
- legacy drafts list/detail/profile draft entry 3개를 직접 고정하는 UI test 파일을 추가했다.
- runtime 의미를 바꾸지 않는 선에서 list/detail에만 얕은 test seam을 추가했다.
- 이번 범위는 `vitest + eslint`만으로 독립적으로 닫을 수 있음을 확인했다.

## 다음 라운드 우선순위
1. 새 user-facing 회귀가 없으면 이번 `legacy-drafts direct UI test` 범위는 재오픈하지 않는다.
2. 후속이 필요하면 `shared BodyTone surface cleanup`처럼 더 넓은 공용 surface 배치를 별도로 자른다.
