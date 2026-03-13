# 2026-03-13 planning-v3 legacy-drafts list-detail user-facing follow-up

## 변경 파일
- `work/3/13/2026-03-13-planning-v3-legacy-drafts-list-detail-user-facing-followup.md`

## 사용 skill
- `planning-gate-selector`: component-level user-facing 배치에서 `eslint + current-screens guard + diff check`만으로 충분한지 고르는 데 사용
- `route-ssot-check`: `ProfileDraftClient`의 `배치 목록` href가 실제 route와 문서 기준에 맞는지 확인하는 데 사용
- `work-log-closeout`: 이번 라운드의 audit-only 결론, 실행한 검증, 미실행 검증을 `/work` 형식으로 정리하는 데 사용

## 브랜치 메모
- 현재 브랜치는 `pr37-planning-v3-txn-overrides`다.
- branch 의미와 이번 `legacy-drafts list/detail` user-facing 축이 어긋나므로, route/API/parser/import/profile-drafts preflight/apply로 넓히지 않고 body-surface/CTA/confirm/href만 잠그는 범위로 제한했다.

## 변경 이유
- latest `profile-drafts user-facing flow` note 이후 남은 cohesive UI dirty는 `DraftDetailClient`, `DraftsListClient`, `ProfileDraftClient` 3개로 좁혀졌다.
- 이 3개는 공통으로 body-surface 정리, CTA surface 통일, delete confirm 경험 정리, canonical href 정렬 성격이라 한 축으로 묶는 편이 자연스러웠다.
- direct legacy-drafts UI test 파일은 현재 없어서, 이번 라운드는 component audit + `eslint` + route guard로 닫는 편이 가장 작은 검증 세트였다.

## body-surface / CTA / confirm / href 정리
- `src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx`
  - `목록으로 돌아가기`를 `BodyActionLink`로 맞추고, `초안 요약`/`Merged Profile 미리보기` heading과 diff inset을 body surface 기준으로 정리한 상태였다.
  - `기준 프로필을 선택해 ... 먼저 확인` 설명 문구도 현재 detail 화면 의미와 자연스럽게 맞았다.
  - 이번 라운드에서는 추가 수정 없이 유지했다.
- `src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
  - inline `window.confirm`은 제거되고, `초안 삭제 확인` dialog surface로 분리된 상태였다.
  - empty state `저장된 초안이 없습니다.`, `Profile 초안 생성` CTA, `상세` action, 저장 후 `새로 저장한 Draft 열기` surface도 `BodyInset`/`BodyTableFrame`/`BodyActionLink` 기준으로 정렬돼 있었다.
  - 이번 라운드에서는 추가 수정 없이 유지했다.
- `src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx`
  - action row가 body tone 규칙으로 정리돼 있었고, `배치 목록` 링크는 `/planning/v3/transactions/batches`를 가리키도록 바뀌어 있었다.
  - 이 href는 `src/app/planning/v3/transactions/page.tsx`의 canonical redirect와 맞고, `docs/current-screens.md`에도 experimental route로 이미 기록돼 있었다.
  - 이번 라운드에서는 추가 수정 없이 유지했다.

## 조건부 포함 여부
- `ImportCsvClient`
  - 열지 않았다.
  - 이유: 이번 배치의 body-surface/CTA/confirm/href 설명은 legacy drafts 3개만으로 충분했고, import landing까지 열면 parser/import 축으로 커질 가능성이 있었다.
- direct UI test
  - `tests/planning-v3-drafts-ui.test.tsx`는 현재 존재하지 않아 열지 않았다.
  - `tests/planning-v3-import-csv-upload-ui.test.tsx`도 이번 배치와 직접 연결되지 않아 열지 않았다.
- route guard
  - 열었다.
  - 이유: `ProfileDraftClient`의 `배치 목록` href 변경이 실제 사용자 경로 계약에 닿아 있어 `pnpm planning:current-screens:guard`로 canonical route 존재 여부를 확인할 필요가 있었다.

## 검증
- 기준선 확인
  - `sed -n '1,260p' work/3/13/2026-03-13-planning-v3-profile-drafts-user-facing-flow-followup.md`
  - `sed -n '1,260p' .codex/skills/planning-gate-selector/SKILL.md`
  - `sed -n '1,260p' .codex/skills/route-ssot-check/SKILL.md`
  - `sed -n '1,260p' .codex/skills/work-log-closeout/SKILL.md`
- 상태 잠금 / audit
  - `git status --short -- src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx tests/planning-v3-drafts-ui.test.tsx tests/planning-v3-import-csv-upload-ui.test.tsx docs/current-screens.md`
  - `git diff -- src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx docs/current-screens.md tests/planning-v3-import-csv-upload-ui.test.tsx`
  - `sed -n '1,280p' src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx`
  - `sed -n '280,520p' src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx`
  - `sed -n '1,280p' src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
  - `sed -n '280,520p' src/app/planning/v3/drafts/_components/DraftsListClient.tsx`
  - `sed -n '1,260p' src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx`
  - `sed -n '1,120p' src/app/planning/v3/transactions/page.tsx`
  - `sed -n '1,260p' src/components/ui/BodyTone.tsx`
  - `rg --files tests | rg 'planning-v3-drafts-ui\\.test\\.tsx|planning-v3-import-csv-upload-ui\\.test\\.tsx'`
  - `rg -n "DraftsListClient|DraftDetailClient|ProfileDraftClient|v3-draft-delete-|v3-profile-draft-generate|/planning/v3/transactions/batches|/planning/v3/transactions" tests src/app/planning/v3 -g '!src/app/api/**'`
- eslint
  - `pnpm exec eslint src/app/planning/v3/drafts/[id]/_components/DraftDetailClient.tsx src/app/planning/v3/drafts/_components/DraftsListClient.tsx src/app/planning/v3/drafts/profile/_components/ProfileDraftClient.tsx`
  - PASS
- route guard
  - `pnpm planning:current-screens:guard`
  - PASS (`5 files`, `9 tests`)

## 미실행 검증
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- direct legacy-drafts UI test
  - 해당 파일이 현재 없어 실행하지 않았다.

## 남은 리스크
- `DraftDetailClient`, `DraftsListClient`, `ProfileDraftClient`는 이번 라운드에서 audit-only로 닫았기 때문에, selector/CTA를 직접 고정하는 legacy-drafts 전용 UI test는 여전히 없다.
- `docs/current-screens.md`는 이번 범위 밖의 큰 dirty surface를 포함한 상태다. 이번 라운드에서는 `transactions/batches` 경로 존재 확인용으로만 guard를 사용했고, 문서 대량 정리는 하지 않았다.
- `BodyTone.tsx`도 별도 dirty surface라 이번 라운드에서는 계약 전제만 사용했다. 공용 tone helper 자체를 다시 정리하는 라운드는 별도로 분리하는 편이 안전하다.

## 이번 라운드 완료 항목
- legacy drafts list/detail/profile draft entry 3개가 body-surface/CTA/confirm/href 기준으로 현재 의도와 맞는지 audit했다.
- `ProfileDraftClient`의 `배치 목록` 링크가 canonical route `/planning/v3/transactions/batches`와 맞는지 route guard로 확인했다.
- 이번 범위에서는 코드 추가 수정 없이 닫을 수 있다는 결론을 남겼다.

## 다음 라운드 우선순위
1. 새 user-facing 이슈가 없으면 이번 `legacy-drafts list/detail` 범위는 재오픈하지 않는다.
2. 다음 후속이 필요하면 `legacy-drafts direct UI test hardening` 또는 `shared BodyTone surface cleanup`처럼 더 작은 별도 축으로 자른다.
