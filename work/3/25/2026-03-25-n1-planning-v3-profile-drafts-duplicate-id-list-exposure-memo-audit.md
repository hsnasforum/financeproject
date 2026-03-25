# 2026-03-25 N1 planning-v3 profile-drafts duplicate-id list-exposure memo audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `work/3/25/2026-03-25-n1-planning-v3-profile-drafts-duplicate-id-list-exposure-memo-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: writer owner를 유지한 채 `profile/drafts` list exposure 의미만 좁은 memo로 정리했다.
- `route-ssot-check`: `/planning/v3/profile/drafts*`가 계속 beta route이고 stable `/planning*`와 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` closeout 형식과 남은 리스크를 현재 라운드 기준으로 정리했다.

## 변경 이유
- 직전 라운드에서 next `N1` candidate로 남겨 둔 `profile/drafts duplicate-id list exposure memo`를 current route meaning 기준으로 더 좁혀 잠글 필요가 있었다.
- `/api/planning/v3/profile/drafts` GET과 `/planning/v3/profile/drafts` page는 duplicate collapse 없이 same-id row를 surface할 수 있지만, detail/preflight/apply와 list client wiring은 고유 `draftId`를 전제하므로 이 노출을 steady-state contract로 읽기 어려웠다.
- broad draft-family merge나 `N2` 구현을 열기 전에, duplicate-id list exposure가 intended beta state인지 anomaly leak인지부터 문서로 잠그는 편이 더 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 `profile/drafts duplicate-id list-exposure memo audit`를 추가했다.
- `/api/planning/v3/profile/drafts` GET과 `/planning/v3/profile/drafts` page가 duplicate same-id row를 literal하게 beta surface에 노출할 수 있지만, current code의 row key / href / delete target / detail precedence는 unique `draftId`를 전제한다고 정리했다.
- 따라서 current duplicate-id list exposure를 intended steady-state beta state가 아니라 historical/operator anomaly leak로 읽는 편이 맞다고 잠갔다.
- draft-family duplicate/list exposure 범위의 current smallest viable next `N1` candidate는 `none for now`로 정리했다.
- 이번 라운드에서도 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`는 읽기 기준으로만 두고 추가 수정하지 않았다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-profile-drafts-duplicate-id-list-exposure-memo-audit.md`

## 남은 리스크
- current code는 duplicate same-id row를 literal하게 surface할 수 있지만, 이를 list에서 badge/collapse/no-data 중 무엇으로 다룰지는 아직 `N2`/visibility 범위다.
- same-id duplicate가 API/page/detail 사이에서 서로 다른 semantics를 갖는다는 점은 정리됐지만, future route contract가 이 anomaly를 어떻게 표준화할지는 여전히 `[검증 필요]`다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
