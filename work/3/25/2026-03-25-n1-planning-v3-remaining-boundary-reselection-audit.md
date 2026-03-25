# 2026-03-25 N1 planning-v3 remaining-boundary reselection audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`
- `work/3/25/2026-03-25-n1-planning-v3-remaining-boundary-reselection-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only audit 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: draft-family closeout 이후 남은 owner boundary를 batch read ownership과 `N2` contract 질문으로 다시 분리하는 기준으로 사용했다.
- `route-ssot-check`: stable `/planning*`와 beta `/planning/v3/*` route SSOT가 이번 remaining-boundary 해석과 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` audit 메모 형식과 잔여 리스크를 현재 라운드 기준으로 정리했다.

## 변경 이유
- draft-family 범위는 `none for now`로 닫혔지만, `N1 planning/v3 canonical entity model` 전체 기준에서 실제로 어떤 unresolved boundary가 남아 있는지 다시 고를 필요가 있었다.
- broad canonical rewrite나 `N2` 구현을 바로 여는 대신, 남은 질문을 `N1 current-state owner-sync`와 `N2` contract/defer 축으로 다시 잠그는 편이 가장 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`에 `N1 remaining-boundary reselection audit` 연결 메모를 추가했다.
- draft-family는 parked/`none for now` 상태를 유지하고, current `N1` remaining boundary를 `ImportBatch / TransactionRecord` read ownership question 하나로 다시 좁혔다.
- `NewsAlertRuleOverride`는 owner 구현 확인까지는 끝났고, 남은 질문이 export/rollback grouping 같은 `N2` contract question이라는 점을 명시했다.
- `analysis_docs/v2/12_planning_v3_canonical_entity_model.md`에 remaining-boundary map, still-valid owner boundary, `N1` vs `N2` split, current smallest viable next `N1` candidate를 추가했다.
- 이번 라운드에서도 `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`는 읽기 기준으로만 두고 추가 수정하지 않았다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n1-planning-v3-remaining-boundary-reselection-audit.md`

## 남은 리스크
- `ImportBatch / TransactionRecord` read ownership은 current smallest `N1` candidate로 다시 좁혔지만, list/detail/summary/balances/delete가 공유하는 stored-first + legacy/coexistence read stack wording은 아직 후속 메모에서 더 잠가야 한다.
- `NewsAlertRuleOverride`는 owner 구현 확인이 끝났어도 export/import/rollback grouping은 여전히 `N2` contract 범위에 남아 있다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
