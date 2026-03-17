# 2026-03-16 P2-2 producer handoff first path

## 이번 배치 대상 항목 ID
- `P2-2`

## 변경 파일
- `src/app/planning/reports/_components/ReportRecommendationsSection.tsx`
- `src/app/recommend/page.tsx`
- `src/lib/schemas/recommendProfile.ts`
- `tests/schemas-recommend-profile.test.ts`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p2-2-producer-handoff-first-path.md`

## 사용 skill
- `planning-gate-selector`: report link + recommend page/query 변경에 맞는 최소 검증 세트를 고르는 데 사용.
- `route-ssot-check`: `/recommend` producer 링크가 실존 public route를 계속 가리키는지 확인하는 데 사용.
- `work-log-closeout`: 이번 handoff 배치의 변경 파일, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- 지난 라운드에서는 recommend consumer 쪽이 `planning.runId`와 `planning.summary.stage`를 읽을 수만 있게 열려 있었고, 실제 producer 경로는 없었습니다.
- 이번 라운드는 planning report의 추천 섹션 한 경로만 골라 `/recommend`까지 planning handoff를 실제로 태우는 최소 producer path를 여는 것이 목적이었습니다.

## 핵심 변경
- `ReportRecommendationsSection`의 `전체 추천 보기` 링크가 `/recommend`로 갈 때 `planning.runId`, `planning.summary.stage`, optional `planning.summary.overallStatus`를 query로 함께 전달하도록 바꿨습니다.
- query 키는 새 alias를 만들지 않고 계약 필드명 그대로 `planning.runId`, `planning.summary.stage`, `planning.summary.overallStatus`를 사용했습니다.
- `/recommend` query parser는 위 3개 키를 읽어 `UserRecommendProfile.planning`으로 합치고, 이후 `/api/recommend` request로 그대로 전달합니다.
- `toSavedRunProfile()`가 `planning`과 legacy `planningContext`를 함께 보존하도록 바꿔, 결과 저장 시 profile에서도 handoff가 유지되게 했습니다.
- route surface 자체는 바꾸지 않았으므로 `docs/current-screens.md` 수정은 하지 않았습니다.

## 검증
- `pnpm exec vitest run tests/schemas-recommend-profile.test.ts tests/recommend-api.test.ts tests/saved-runs-store.test.ts`
  - 통과. 3개 파일 14개 테스트가 모두 통과했습니다.
- `pnpm build`
  - 통과.
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/app/planning/reports/_components/ReportRecommendationsSection.tsx src/app/recommend/page.tsx src/lib/schemas/recommendProfile.ts tests/schemas-recommend-profile.test.ts work/3/16/2026-03-16-p2-2-producer-handoff-first-path.md`

## 남은 리스크
- 이번 라운드는 report 추천 섹션 한 경로만 열었고, 다른 planning surface는 아직 `planning.runId` handoff를 보내지 않습니다.
- `planning.summary.stage`는 report VM의 raw run payload에서 읽어 오므로, 향후 handoff projection이 별도 저장되면 source를 더 명시적으로 바꾸는 편이 안전합니다.
- `planningContext`와 `planning`이 함께 저장되므로, producer 경로가 늘어나면 어느 값을 우선하는지 UI 설명이 후속 라운드에서 더 필요할 수 있습니다.

## 다음 우선순위
- `P2-2` 후속: producer 경로를 더 늘리지 말고, 이번 report → recommend path에서 받은 `planning`을 explanation/meta에 어떻게 노출할지 범위를 좁혀 결정
- `P2-3`: `PlanningActionDto` 기준 CTA preset과 recommend preset mapping 초안 정리
