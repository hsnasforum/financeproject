# Frontend Housing Subscription Dark Accent Cleanup (2026-03-15)

## Batch Purpose
- `/housing/subscription` 화면의 공고 리스트에 남아 있는 과도한 `bg-slate-900` 악센트들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 청약 정보 확인 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(CTA 버튼 일부)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Region Badge in List Card (`SubscriptionClient.tsx`)**:
   - 지역 정보를 나타내는 배지가 `bg-slate-900`으로 되어 있어 개별 카드에서 시각적 무게감이 너무 큼.
2. **Announcement Link Button (`SubscriptionClient.tsx`)**:
   - '공고문 보기' 버튼이 `bg-slate-900`으로 되어 있어 리스트 전체가 어두워 보이는 인상을 줌.

## Planning & Strategy
1. **Bright Accent Transition**:
   - 지역 배지를 `bg-slate-100`, `text-slate-600`, `border-slate-200` 조합으로 변경하여 메타 정보로서의 적절한 위계를 부여.
2. **Emerald Highlighting**:
   - '공고문 보기' 버튼을 `bg-emerald-600` 테마로 변경. 이는 'Housing' 도메인의 주요 액션임을 강조하면서도 1안의 밝은 톤과 조화를 이룸.
   - 그림자에 `shadow-emerald-900/10`을 추가하여 세련된 입체감 확보.
3. **Modal Consistency**:
   - 상세 모달의 '공고 전문 보기'는 이미 에메랄드 테마를 사용 중이므로, 리스트의 버튼도 이에 맞춰 통일감을 형성.

## Summary of Changes
- **`SubscriptionClient.tsx`**: 
  - 공고 리스트 카드의 지역 배지 배경을 `bg-slate-900` → `bg-slate-100`으로 전환.
  - '공고문 보기' 버튼 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환하고 호버 효과 및 그림자 최적화.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 청약 공고 조회 및 필터링 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/publicApis/**`: 외부 API 연동 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Visual Balance**: 모든 카드의 버튼이 에메랄드색으로 바뀌었으므로, 리스트가 너무 화려하게 느껴지는지 실사용 데이터 기반 모니터링 필요.
