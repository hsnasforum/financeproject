# 2026-03-25 N1 planning-v3 primary-vs-legacy same-id duplicate precedence memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `work/3/25/2026-03-25-n1-planning-v3-primary-vs-legacy-same-id-duplicate-precedence-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: writer owner를 유지한 채 same-id duplicate precedence만 좁은 memo로 정리했다.
- `route-ssot-check`: stable `/planning*`와 beta `/planning/v3/*` route mapping이 이번 precedence memo와 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` closeout 형식과 잔여 리스크를 현재 라운드 기준으로 정리했다.

## 변경 이유
- 직전 라운드에서 next `N1` candidate로 남겨 둔 `primary-vs-legacy same-id duplicate precedence memo`를 current code 기준으로 잠글 필요가 있었다.
- `src/lib/planning/v3/store/draftStore.ts`는 same sanitized id가 primary/legacy 양쪽에 동시에 있어도 list는 둘 다 남길 수 있고, detail은 primary-valid-first로 하나만 읽고, delete는 양쪽을 함께 지우므로 surface별 암묵 precedence가 갈린다.
- broad draft-family merge나 `N2` 구현을 열기 전에, 이 precedence divergence를 current-state memo로 먼저 고정하는 편이 더 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 `primary-vs-legacy same-id duplicate precedence memo audit`를 추가했다.
- `listDraftFiles()`가 full file path 기준 dedupe만 수행해 same-id duplicate를 그대로 남기고, `getDraft()` / `getProfileDraft()`는 primary-valid-first, `deleteDraft()` / `deleteProfileDraft()`는 dual-target sweep이라고 정리했다.
- `/api/planning/v3/draft/preview`, `/api/planning/v3/profile/drafts/[id]`, `preflight`, `apply`는 single-row detail precedence를 공유하지만, `/api/planning/v3/profile/drafts` list route는 same-id duplicate exposure를 surface할 수 있다고 잠갔다.
- next `N1` smallest viable candidate를 broad merge가 아니라 `profile/drafts duplicate-id list exposure memo`로 더 좁혔다.
- 이번 라운드에서도 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`는 읽기 기준으로만 두고 추가 수정하지 않았다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-primary-vs-legacy-same-id-duplicate-precedence-memo-audit.md`

## 남은 리스크
- same-id duplicate가 list surface에서 visible state인지 operator/historical anomaly인지 현재 문서에 완전히 잠기지 않아, 후속 memo 없이 broad merge를 열면 route 의미가 다시 섞일 수 있다.
- same id와 same `createdAt`까지 겹칠 때 list order는 comparator만으로 명시되지 않으므로, root order가 contract인지 여부는 여전히 `[검증 필요]`다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
