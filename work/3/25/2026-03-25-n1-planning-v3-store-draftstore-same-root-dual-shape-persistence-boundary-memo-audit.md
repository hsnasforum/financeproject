# 2026-03-25 N1 planning-v3 store-draftStore same-root dual-shape persistence-boundary memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `work/3/25/2026-03-25-n1-planning-v3-store-draftstore-same-root-dual-shape-persistence-boundary-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: draft family owner를 유지한 채 same-root dual-shape boundary만 좁은 memo로 정리했다.
- `route-ssot-check`: stable `/planning*`와 beta `/planning/v3/*` route mapping이 이번 persistence-boundary 해석과 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` closeout 형식과 남은 리스크 정리를 현재 라운드 기준으로 맞췄다.

## 변경 이유
- 직전 라운드에서 next `N1` candidate로 남겨 둔 `store/draftStore.ts same-root dual-shape persistence boundary memo`를 current code 기준으로 더 좁혀 잠글 필요가 있었다.
- `src/lib/planning/v3/store/draftStore.ts`는 `V3DraftRecord`와 `DraftProfileRecord`가 같은 primary root, 같은 legacy fallback, 같은 `<id>.json` path template를 공유하므로, persisted path만 보고 owner를 읽으면 다시 섞일 수 있다.
- broad draft-family merge나 `N2` 구현을 열기 전에, same root를 어떤 normalizer와 route meaning이 분리하고 있는지부터 문서에 고정해야 했다.

## 핵심 변경
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 `store/draftStore.ts same-root dual-shape persistence-boundary memo audit`를 추가했다.
- `resolveDraftsDir()` / `resolveLegacyDraftsDir()` / `listDraftFiles()` / `readAllDrafts()`가 primary+legacy 전체 file pool 위에서 shape별 normalizer를 태우는 구조라고 정리했다.
- `createDraft()` / `getDraft()` / `deleteDraft()`와 `createDraftFromBatch()` / `getProfileDraft()` / `deleteProfileDraft()`가 같은 root/fallback/path template를 공유하지만, current owner boundary는 normalizer와 route meaning으로 갈린다고 잠갔다.
- next `N1` smallest viable candidate를 broad merge가 아니라 `primary-vs-legacy same-id duplicate precedence memo`로 더 좁혔다.
- 이번 라운드에서는 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`는 읽기 기준으로만 두고 추가 수정하지 않았다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-store-draftstore-same-root-dual-shape-persistence-boundary-memo-audit.md`

## 남은 리스크
- `listDraftFiles()`는 full file path 기준으로만 dedupe하고, `getDraft()` / `getProfileDraft()`는 primary-first fallback을 쓰므로 same-id dual presence가 있을 때 list/detail/delete precedence가 암묵적으로 달라질 수 있다.
- current code는 같은 root와 같은 `<id>.json` path template를 두 shape가 공용으로 쓰므로, file placement만 보고 owner를 추론하면 다시 섞여 읽힌다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
