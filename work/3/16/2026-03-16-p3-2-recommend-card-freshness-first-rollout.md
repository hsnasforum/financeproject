# 2026-03-16 P3-2 recommend card freshness first rollout

## 변경 파일
- `src/app/recommend/page.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p3-2-recommend-card-freshness-first-rollout.md`

## 사용 skill
- `planning-gate-selector`: `/recommend` 페이지 UI 변경이라 `pnpm build`와 diff check만으로 이번 라운드 검증 범위를 작게 고정하는 데 사용.
- `dart-data-source-hardening`: freshness/fallback 메타를 다루는 만큼 `/api/sources/status` 조회 실패 시 카드가 조용히 숨고, 운영 진단은 `/settings/data-sources` owner로 남기는 실패 모드 기준을 점검하는 데 사용.
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 오늘 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P3-2` 문서에서 first rollout path를 `/recommend` 결과 카드로 고정했으므로, 배너 없이 읽을 수 있는 얇은 freshness 메타를 실제 화면에 처음 연결할 필요가 있었습니다.
- 사용자 화면에서는 운영성 `DataFreshnessBanner`를 다시 들고 오지 않고, 카드 해석에 필요한 최소 기준 정보만 작게 붙이는 방향을 유지해야 했습니다.

## 핵심 변경
- `/recommend` 결과 카드에 `결과 기준` 블록을 추가해 `lastSyncedAt`, `freshnessStatus`, explicit `fallbackMode`, assumption note를 카드 메타로 노출했습니다.
- `sourceId`, `kind`는 기존 `item.sourceId`, `item.kind`를 그대로 쓰고, `lastSyncedAt`과 `freshnessStatus`는 `/api/sources/status` row를 `(sourceId, kind)` 기준으로 얇게 매칭해서 계산했습니다.
- `fallbackMode`는 `result.meta.fallback.mode`가 있을 때만 붙였고, stale 상태만 보고 추론하지 않았습니다.
- assumption note는 기존 `rateSelectionPolicy`, `depositProtectionPolicy`만 0~2줄 수준으로 재사용했고, 새 계산 문구는 만들지 않았습니다.
- source status row 매칭이 안 되거나 `/api/sources/status` 조회가 실패하면 freshness 메타를 조용히 숨기고, 추천 카드와 기존 error/empty 흐름은 그대로 유지했습니다.
- 기존 trust cue의 `화면 상단 데이터 배너 기준` 문구는 현재 카드의 `결과 기준` 메타와 settings trust hub를 가리키도록 바꿨습니다.

## 검증
- `pnpm build`
- `git diff --check -- src/app/recommend/page.tsx analysis_docs/v2/financeproject_next_stage_plan.md work/3/16/2026-03-16-p3-2-recommend-card-freshness-first-rollout.md`

## 남은 리스크
- `/recommend` 카드에 `sourceId`, `kind`는 이미 있지만, source status row namespace가 다른 public surface까지 통일된 것은 아니어서 `/products`나 `subscription` 확장은 별도 adapter가 필요합니다.
- 현재 first rollout은 `/api/sources/status` fetch가 실패하면 freshness 메타를 숨기는 안전한 경로를 택했으므로, settings trust hub로 들어가지 않으면 기준 정보가 보이지 않을 수 있습니다.
- `fallbackMode`와 assumption note는 result-level meta를 카드에 얇게 재사용한 수준이라, 카드별 근거를 더 세밀하게 분리하는 것은 후속 라운드가 필요합니다.
