# 2026-03-17 P3-2 subscription freshness fourth rollout

## 변경 파일
- `src/components/SubscriptionClient.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/17/2026-03-17-p3-2-subscription-freshness-fourth-rollout.md`

## 사용 skill
- `planning-gate-selector`: `SubscriptionClient` 단일 UI surface 변경이라 `pnpm build`와 diff check만으로 검증 범위를 작게 고정하는 데 사용.
- `dart-data-source-hardening`: public data meta를 얇은 helper로 낮추면서 explicit timestamp와 fallback만 노출하고, source status row가 없는 surface에서 과장된 freshness 상태를 만들지 않도록 점검하는 데 사용.
- `work-log-closeout`: 오늘 `/work` 경로에 실제 변경 파일, 실행한 검증, 남은 리스크를 closeout 형식으로 남기는 데 사용.

## 변경 이유
- `P3-2` 문서 기준 fourth rollout 대상은 `/housing/subscription` 결과 화면이었고, 현재 화면은 assumption note와 설정 링크는 이미 있었지만 결과 기준 시각과 fallback 상태는 요약 영역에서 읽을 수 없었습니다.
- 사용자 화면에서는 운영 배너를 다시 붙이지 않고, subscription API가 이미 주는 explicit meta와 existing assumption note만 summary helper로 연결해야 했습니다.

## 핵심 변경
- `SubscriptionClient`가 subscription API 응답을 `SubscriptionApiResponse`로 읽고, `generatedAt` 우선, 없으면 `fetchedAt`, explicit `fallback.mode`, `assumptions.note`를 조합한 `freshnessMeta`를 만들도록 추가했습니다.
- `sourceId`, `kind`는 코드 내부에서 모두 existing owner string `subscription`으로 두고, UI에는 노출하지 않았습니다.
- 결과 개수 summary 옆에 `결과 기준 <시각>` chip과 optional `캐시 기준` / `재생 데이터 기준` chip을 추가했습니다.
- existing `assumptions.note`는 별도 배너나 새 계산 없이 `참고:` 한 줄로만 연결했습니다.
- explicit source status row가 현재 이 surface에 없으므로 `freshnessStatus`는 억지 계산하지 않고 생략했습니다.
- 기존 error state와 `/settings/data-sources` 링크는 그대로 유지했고, 카드별 반복 메타는 추가하지 않았습니다.

## 검증
- `pnpm build`
- `git diff --check -- src/components/SubscriptionClient.tsx analysis_docs/v2/financeproject_next_stage_plan.md work/3/17/2026-03-17-p3-2-subscription-freshness-fourth-rollout.md`

## 남은 리스크
- subscription surface는 `SourceStatusRow` 기반 `freshnessStatus` owner가 아직 없어 `lastSyncedAt`과 explicit fallback helper만 읽습니다.
- live 응답에서 `generatedAt`가 없으면 `fetchedAt`로만 기준 시각을 보여 주므로, source-origin timestamp와 fetch timestamp가 항상 구분되지는 않습니다.
- `fallback.mode === "LIVE"`는 굳이 helper로 노출하지 않아 기준 시각과 note만 보일 수 있습니다.
