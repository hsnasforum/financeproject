# 2026-03-16 P3-2 source freshness contract 정의

## 변경 파일
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `analysis_docs/v2/03_DTO_API_명세서.md`
- `analysis_docs/v2/08_source_freshness_contract.md`
- `work/3/16/2026-03-16-p3-2-source-freshness-contract-definition.md`

## 사용 skill
- `work-log-closeout`: 이번 계약 정의 라운드에서 실제로 읽은 코드 자산, 문서 결정, 실행한 검증 명령을 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 사용자 화면에서 운영성 freshness/fallback 배너를 제거한 뒤, public 결과 카드에 어떤 최소 trust 메타를 붙일지 별도 contract가 필요해졌습니다.
- 기존 `DataFreshnessBanner`는 운영 배너 로직과 settings trust hub에 더 가깝고, public 카드에 그대로 재도입하는 방향은 현재 UX 원칙과 맞지 않습니다.
- 이번 라운드는 broad implementation 전에 card-level freshness meta의 필드, owner, fallback 규칙, first rollout path를 문서로 먼저 고정하는 배치입니다.

## 핵심 변경
- `P3-2`를 `[진행중]`으로 올리고, banner severity가 아니라 `FreshnessItemStatus` 기반의 card-level freshness 상태를 재사용하는 방향을 상태판에 반영했습니다.
- `PublicSourceFreshnessMetaDto` 권장 shape를 `sourceId`, `kind`, `lastSyncedAt`, `freshnessStatus`, `fallbackMode`, `assumptionNotes` 6개 필드로 고정했습니다.
- 각 필드에 대해 canonical owner, 현재 코드에서 재사용 가능한 값, 값이 없을 때 fallback 규칙, user-facing copy 수준을 문서로 정리했습니다.
- public 결과 카드와 `/settings/data-sources` trust hub의 역할을 분리해, 카드에는 짧은 결과 메타만 두고 raw 운영 진단은 settings owner로 남기는 원칙을 명시했습니다.
- first rollout path는 `/recommend` 결과 카드로 권장하고, `/products/deposit|saving`, `subscription/exchange/public info`는 후속 순서로 좁혔습니다.

## 검증
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md analysis_docs/v2/03_DTO_API_명세서.md analysis_docs/v2/08_source_freshness_contract.md work/3/16/2026-03-16-p3-2-source-freshness-contract-definition.md`

## 남은 리스크
- `sourceId` namespace는 모든 public surface에서 아직 단일 enum으로 정규화되지 않아, 첫 구현은 surface adapter 기준으로 조심스럽게 열어야 합니다.
- `/recommend`는 `item.sourceId`, `item.kind`는 이미 있지만 `lastSyncedAt`과 `freshnessStatus`를 붙이려면 source status row adapter를 별도로 얇게 넣어야 합니다.
- `subscription`, `exchange`, 공공 정보 카드 쪽은 fallback owner와 source key가 아직 recommend만큼 정리되지 않아 first rollout 다음 순서로 두는 것이 안전합니다.
