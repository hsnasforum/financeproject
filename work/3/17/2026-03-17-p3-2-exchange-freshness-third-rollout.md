# 2026-03-17 P3-2 exchange freshness third rollout

## 변경 파일
- `src/components/ExchangeSummaryCard.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/17/2026-03-17-p3-2-exchange-freshness-third-rollout.md`

## 사용 skill
- `planning-gate-selector`: `ExchangeSummaryCard` 단일 UI surface 변경이라 `pnpm build`와 diff check만으로 검증 범위를 작게 고정하는 데 사용.
- `dart-data-source-hardening`: 환율 fallback/as-of/assumption 값을 사용자용 helper로 낮추면서 운영 배너를 다시 들고 오지 않고, explicit 값만 노출하는 실패 모드 기준을 점검하는 데 사용.
- `work-log-closeout`: 오늘 `/work` 경로에 실제 변경 파일, 실행한 검증, 남은 리스크를 closeout 형식으로 남기는 데 사용.

## 변경 이유
- `P3-2` 문서 기준 third rollout 대상은 `ExchangeSummaryCard` 한 곳이었고, 현재 카드의 상단 `asOf` badge와 하단 fallback 문구가 분산되어 있어 결과 기준을 일관되게 읽기 어려웠습니다.
- 사용자 화면에서는 운영성 배너를 다시 붙이지 않고, 이미 payload가 가진 `asOf`, `fallbackDays`, `assumptions.note`만 얇은 freshness 메타로 재구성해야 했습니다.

## 핵심 변경
- `ExchangeSummaryCard`에 `결과 기준` helper를 추가해 `기준 확인`, optional `최근 영업일 기준`, `참고` note를 한 블록으로 묶었습니다.
- 상단 날짜 badge와 하단 fallback 문구는 제거하고, 카드 내부 helper에서만 `data.asOf`와 `meta.fallbackDays`를 읽도록 정리했습니다.
- `assumptions.note`를 local response type에 반영해 `환율은 기준일 데이터 기반 참고값입니다.` 같은 해석용 문구만 재사용했습니다.
- `sourceId`, `kind`는 코드 내부에서 모두 `exchange` existing owner string으로 두고, UI에는 노출하지 않았습니다.
- explicit source status row가 현재 이 surface에 없으므로 `freshnessStatus`는 억지 계산하지 않고 생략했습니다.
- 기존 error state와 `/settings/data-sources` 링크는 그대로 유지했습니다.

## 검증
- `pnpm build`
- `git diff --check -- src/components/ExchangeSummaryCard.tsx analysis_docs/v2/financeproject_next_stage_plan.md work/3/17/2026-03-17-p3-2-exchange-freshness-third-rollout.md`

## 남은 리스크
- exchange surface는 아직 `SourceStatusRow` 기반 `freshnessStatus` owner가 없어 `lastSyncedAt`과 explicit fallback helper만 노출합니다.
- `fallbackDays`가 0이면 fallback chip은 숨겨지므로, 사용자는 기준일과 assumption note만 보게 됩니다.
- `subscription`이나 다른 public info surface는 이번 라운드 범위에 포함하지 않았습니다.
