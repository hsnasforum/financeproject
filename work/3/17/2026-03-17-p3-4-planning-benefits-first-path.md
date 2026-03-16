# 2026-03-17 P3-4 planning 혜택 support-layer first path

## 변경 파일
- `src/app/planning/reports/_components/ReportBenefitsSection.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/17/2026-03-17-p3-4-planning-benefits-first-path.md`

## 사용 skill
- `planning-gate-selector`: planning report section의 route/link + UI 변경에 필요한 최소 검증 세트를 고르는 데 사용.
- `route-ssot-check`: `/benefits` deep-link가 existing stable route와 현재 query contract 안에 있는지 확인하는 데 사용.
- `work-log-closeout`: 이번 first path의 변경 파일, 검증, 남은 리스크를 오늘 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- planning report의 `혜택 후보 분석`은 이미 유용한 후보를 좁혀 주고 있었지만, 섹션 톤이 standalone 탐색처럼 읽힐 여지가 있어 `planning secondary host` 기준이 충분히 드러나지 않았습니다.
- 이번 라운드는 새 혜택 기능을 여는 대신, planning 안에서는 우선 확인 후보를 좁혀 주는 보조 레이어로만 읽히게 하고 `/benefits`를 공식 탐색 경로로 다시 연결하는 가장 작은 1차 구현입니다.

## 핵심 변경
- `ReportBenefitsSection` 상단 copy를 `혜택 탐색 보조` / `플래닝 기준 혜택 후보 좁히기`로 바꾸고, planning 안에서는 후보를 먼저 좁혀 주는 보조 레이어라는 점을 명시했습니다.
- section-level primary CTA `혜택 탐색에서 조건 다시 확인`을 추가해, planning secondary host에서 `/benefits` primary host로 이동하는 공식 경로 1건을 열었습니다.
- deep-link는 새 param 없이 `recommendation.signals`의 기존 값만 재사용해 `query`, `topics`, `sido`, `sigungu`를 `/benefits` query로 넘깁니다.
- amber 설명 카드에도 “수급 가능 여부를 확정하는 화면이 아니다”와 “세부 자격과 실제 신청 판단은 혜택 탐색과 원문 공고에서 다시 확인” 문구를 추가해 톤을 보정했습니다.
- 기존 카드의 `내용 상세보기`와 external apply CTA는 그대로 유지했습니다.

## 검증
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- src/app/planning/reports/_components/ReportBenefitsSection.tsx analysis_docs/v2/financeproject_next_stage_plan.md work/3/17/2026-03-17-p3-4-planning-benefits-first-path.md`

## 남은 리스크
- 이번 라운드는 section-level CTA 1건만 열었고, card-level CTA 위계나 `/benefits`에서의 후속 copy 연결은 아직 후속 조정 여지가 있습니다.
- `recommendation.signals.query`가 없는 경우에는 `topics`와 지역 정보만으로 deep-link가 구성되므로, 검색 폭이 넓게 남을 수 있습니다.
- 운영 정보나 freshness 진단은 의도적으로 이 섹션에 넣지 않았고, 계속 `/settings/data-sources` owner로 남겨 두었습니다.
