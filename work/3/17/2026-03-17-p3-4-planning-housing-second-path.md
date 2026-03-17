# 2026-03-17 P3-4 planning 주거 support-layer second path

## 변경 파일
- `src/app/planning/reports/_components/ReportDashboard.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/17/2026-03-17-p3-4-planning-housing-second-path.md`

## 사용 skill
- `planning-gate-selector`: planning report 안의 helper/CTA 변경에 필요한 최소 검증 세트를 고르는 데 사용.
- `route-ssot-check`: `/housing/subscription?region=전국&mode=all&houseType=apt`가 existing stable route와 현재 query contract 안에 있는지 확인하는 데 사용.
- `work-log-closeout`: 이번 second path의 변경 범위, 실행한 검증, 남은 리스크를 오늘 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `P3-4` 문서 기준으로 `주거`는 `public info(/housing/afford, /housing/subscription)`가 primary host이고 `planning`은 secondary host입니다.
- 하지만 planning report 안에는 아직 이 경계를 분명하게 읽히게 하는 주거 helper가 없어서, 주거 목표/액션이 있는 경우에도 독립 기능 경로가 아니라 보조 확인 경로라는 점이 잘 드러나지 않았습니다.
- 이번 라운드는 새 housing 기능을 여는 대신, planning report 안에서 다음에 확인할 주거 정보를 좁혀 주는 helper와 `/housing/subscription` CTA 1건만 추가하는 가장 작은 배치입니다.

## 핵심 변경
- `ReportDashboard`에서 목표명과 액션 제목/요약을 기준으로 `주거 / 주택 / 집 / 내집 / 아파트 / 전세 / 월세 / 청약` 키워드를 읽어 housing context가 있을 때만 helper를 노출하도록 했습니다.
- top action 섹션 상단에 작은 `주거 판단 보조` helper를 추가해, planning 안에서는 주거비 판단을 확정하지 않고 “다음에 확인할 주거 정보”를 먼저 좁혀 준다는 점을 분명히 했습니다.
- section-level CTA는 existing stable route asset인 `PLANNER_ACTION_LINKS.subscriptionHousing.href`를 그대로 재사용해 `청약 공고 다시 보기`로 연결했습니다.
- `housing/afford` deep-link는 current report surface에서 safe query 재사용이 바로 확인되지 않아 이번 라운드에서는 의도적으로 열지 않았습니다.
- 문구는 “세부 조건과 실제 계약 판단은 주거 화면에서 다시 확인”으로 제한해 planning secondary host 원칙을 유지했습니다.

## 검증
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `git diff --check -- src/app/planning/reports/_components/ReportDashboard.tsx analysis_docs/v2/financeproject_next_stage_plan.md work/3/17/2026-03-17-p3-4-planning-housing-second-path.md`

## 남은 리스크
- 현재 helper는 목표명과 액션 문구의 키워드 기반으로 housing context를 판정하므로, 후속에 더 정교한 explicit VM signal이 생기면 그쪽으로 좁힐 수 있습니다.
- 이번 라운드는 `/housing/subscription` CTA 1건만 열었고, `housing/afford`는 existing query contract 재사용이 명확할 때 별도 라운드에서 검토하는 편이 안전합니다.
- 운영 정보, freshness 진단, fallback 사유는 의도적으로 넣지 않았고 계속 `/settings/data-sources` trust hub owner로 남겨 두었습니다.
