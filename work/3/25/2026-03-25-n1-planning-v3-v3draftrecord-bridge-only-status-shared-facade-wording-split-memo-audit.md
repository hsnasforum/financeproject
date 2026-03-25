# 2026-03-25 N1 planning-v3 V3DraftRecord bridge-only status shared-facade wording split memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/25/2026-03-25-n1-planning-v3-v3draftrecord-bridge-only-status-shared-facade-wording-split-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: draft family owner/bridge 경계를 broad merge 없이 가장 좁은 문서 컷으로 정리했다.
- `route-ssot-check`: stable `/planning*`와 beta `/planning/v3/*` route mapping이 새 owner 해석과 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` closeout 형식과 기록 항목을 현재 라운드 기준으로 정리했다.

## 변경 이유
- 직전 라운드에서 current smallest viable next `N1` candidate로 남겨 둔 `V3DraftRecord bridge-only status / shared-facade wording split memo`를 current code 기준으로 좁혀 잠글 필요가 있었다.
- `src/lib/planning/v3/store/draftStore.ts`의 persisted `V3DraftRecord`를 current route surface에서 first-class owner로 읽을지, preview/apply compatibility bridge로 읽을지 문서상 결론을 내려야 했다.
- `/api/planning/v3/drafts/[id]/create-profile`가 current code에서는 `EXPORT_ONLY` 409만 반환하는데, 일부 계약 문서가 이를 active write route처럼 적고 있어 최소 범위 보정이 필요했다.

## 핵심 변경
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 `V3DraftRecord bridge-only status / shared-facade wording split memo audit`를 추가했다.
- `V3DraftRecord`를 current route surface 기준 standalone owner family가 아니라 preview/apply compatibility bridge document로 읽는 편이 맞다고 잠갔다.
- `src/lib/planning/v3/draft/store.ts`는 canonical owner가 아니라 owner re-export와 bridge alias가 공존하는 shared alias/compat facade라고 wording split을 추가했다.
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`에서 `/api/planning/v3/drafts/[id]/create-profile`를 active command/write route가 아니라 parked support/internal compat route로 바로잡았다.
- 다음 `N1` smallest viable candidate를 `store/draftStore.ts same-root dual-shape persistence boundary memo`로 좁혔다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-v3draftrecord-bridge-only-status-shared-facade-wording-split-memo-audit.md`

## 남은 리스크
- `src/lib/planning/v3/store/draftStore.ts`는 여전히 `V3DraftRecord`와 `DraftProfileRecord`를 같은 module/root/fallback에 두므로, persisted file 경계만 보고 owner를 추론하면 다시 섞여 읽힐 수 있다.
- `/api/planning/v3/profile/drafts/[id]/apply`와 parked `/api/planning/v3/drafts/[id]/create-profile`의 stable profile bridge retention window는 여전히 `N2` contract 범위다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
