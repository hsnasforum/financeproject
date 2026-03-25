# 2026-03-25 N2 planning-v3 singleton-config-family current-state resync audit

## 변경 파일
- `analysis_docs/v2/11_post_phase3_vnext_backlog.md`
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`
- `work/3/25/2026-03-25-n2-planning-v3-singleton-config-family-current-state-resync-audit.md`

## 사용 skill
- `planning-gate-selector`: docs-only resync audit 라운드라 `git diff --check`만 최소 검증으로 고정했다.
- `planning-v3-batch-contract-narrowing`: `3.2`/`3.3`/`3.4` closeout을 reopen하지 않고, `3.5` owner route와 projection/support tier wording만 current code 기준으로 다시 잠그는 기준으로 사용했다.
- `route-ssot-check`: stable `/planning*`와 beta `/planning/v3/*` route SSOT가 이번 `3.5` resync 판단과 충돌하지 않는지 확인했다.
- `work-log-closeout`: `/work` audit 메모 형식과 실제 검증, current stop line과 다음 후보를 현재 라운드 기준으로 정리했다.

## 변경 이유
- post-`3.3` reselection 이후 `3.5 NewsSettings / AlertRule / Exposure / Scenario library`는 singleton config owner family와 projection/support route tier를 current code 기준으로 다시 잠글 필요가 있었다.
- broad `N2` 구현이나 config family rewrite를 열지 않고, wrapper divergence와 support/helper route tier를 current-state wording으로만 재정리하는 편이 가장 작고 안전했다.

## 핵심 변경
- `analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md`의 `3.5` section에 `current-state resync audit (2026-03-25)`를 추가했다.
- `NewsSettings`, `NewsAlertRuleOverride`, `ExposureProfile`, `ScenarioLibraryOverrides` 네 owner family와 `/news/settings`, `/news/alerts/rules`, `/news/exposure`, `/exposure/profile`, `/scenarios/library` 다섯 route의 command/read split을 current code 기준으로 다시 정리했다.
- `news/exposure`와 `exposure/profile`은 같은 `ExposureProfile` owner family를 다루지만 wrapper divergence는 compat surface로만 남고, 별도 owner/export unit으로 읽지 않는다고 명시했다.
- `/news/digest`, `/news/items`, `/news/search`, `/news/today`, `/news/trends`, `/news/scenarios`는 projection/read model tier로, `/news/alerts`, `/news/notes`, `/news/recovery`, `/news/sources`, `/news/refresh`, `/news/weekly-plan`은 support/internal tier로 정리했다.
- next `N2` candidate를 `singleton-config-family current-state closeout docs-only sync`로 좁히고, singleton config family 재설계나 wrapper 통합 구현은 비범위로 고정했다.

## 검증
- `git diff --check -- analysis_docs/v2/11_post_phase3_vnext_backlog.md analysis_docs/v2/12_planning_v3_canonical_entity_model.md analysis_docs/v2/13_planning_v3_api_import_rollback_contract.md work/3/25/2026-03-25-n2-planning-v3-singleton-config-family-current-state-resync-audit.md`

## 남은 리스크
- 이번 라운드는 current-state wording resync만 다뤘다. singleton config owner export/rollback grouping, `news/exposure` vs `exposure/profile` wrapper 통합, support/internal route 승격 여부는 여전히 후속 `N2` 공식 question 범위다.
- `/api/planning/v3/news/sources`와 `/api/planning/v3/news/weekly-plan`을 singleton config owner set으로 올릴지 여부는 current code 기준 `[검증 필요]`다.
- 미실행 검증: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm e2e:rc`, `pnpm planning:current-screens:guard`
