# Frontend Settings Alerts Dark Action Cleanup (2026-03-16)

## Batch Purpose
- `/settings/alerts` 화면에 남아 있는 과도한 `bg-slate-900` 액션들을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 알림 규칙 관리 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트(ON/OFF 상태 일부)로만 사용하도록 격하시킨다.

## Status & Audit
1. **Preset Creation Button (`AlertRulesClient.tsx`)**:
   - 프리셋 '생성' 버튼이 `bg-slate-900`으로 되어 있어 설정 상단에서 과도한 무게감을 가짐.
2. **Add Rule Button (`AlertRulesClient.tsx`)**:
   - '규칙 추가' 버튼의 활성 상태가 `bg-slate-900`으로 되어 있어 1안의 밝은 톤과 충돌함.
   - 비활성 상태(`bg-slate-300`)가 밝은 테마의 다른 요소들과 이질적임.

## Planning & Strategy
1. **Emerald Primary Actions**:
   - 프리셋 생성 및 규칙 추가 등 주요 쓰기(Write) 액션들을 `bg-emerald-600` 테마로 변경.
   - 그림자에 `shadow-emerald-900/20`을 추가하여 세련된 입체감과 시각적 우선순위 확보.
2. **Interactivity Enhancement**:
   - 버튼에 `active:scale-95`와 `transition-all`을 적용하여 현대적인 클릭 피드백 제공.
3. **Disabled State Refinement**:
   - 규칙 추가 버튼의 비활성 상태를 `bg-slate-100`, `text-slate-400`으로 변경하여 메타 정보 성격의 입력폼과 조화를 이루도록 함.
4. **Typographic Hierarchy**:
   - 에메랄드 배경 위에서 `text-white`와 `font-black` 조합을 사용하여 가독성 극대화.

## Summary of Changes
- **`AlertRulesClient.tsx`**: 
  - 프리셋 '생성' 버튼 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환하고 인터랙션 효과 추가.
  - '규칙 추가' 버튼 배경을 `bg-slate-900` → `bg-emerald-600`으로 전환.
  - 규칙 추가 버튼의 비활성 상태 스타일을 밝은 슬레이트 톤으로 재정의.
  - 스타일링을 위한 `cn` 유틸리티 import 추가 및 템플릿 리터럴 정리.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 알림 프리셋 전환, 규칙 추가/삭제 및 정규식 검증 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/dart/**`: 알림 엔진 및 저장소 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Visual Overlap**: 규칙 추가 버튼과 하단의 미리보기 결과(에메랄드 텍스트 포함)가 인접해 있어 시각적으로 너무 복잡해 보이지 않는지 관찰 필요.
