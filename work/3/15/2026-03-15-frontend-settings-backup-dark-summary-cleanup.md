# Frontend Settings Backup Dark Summary Cleanup (2026-03-15)

## Batch Purpose
- `/settings/backup` 화면의 복원 결과 영역에 남아 있는 대형 `bg-slate-900` 블록을 제거한다.
- 전체 UI를 밝은 1안(White/Slate/Emerald) 베이스로 통일하여 설정 관리 경험의 일관성을 확보한다.
- 어두운 톤은 배경이 아닌 제한된 강조 포인트로만 사용하도록 격하시킨다.

## Status & Audit
1. **Restore Result Summary Card (`BackupClient.tsx`)**:
   - 복원 완료 후 나타나는 요약 카드가 큰 `bg-slate-900` 블록으로 되어 있어 페이지 하단에서 과도한 시각적 무게감을 가짐.
2. **Internal Metric Boxes**:
   - 다크 배경용 `bg-white/5` 박스들이 밝은 배경에서는 시인성이 떨어짐.

## Planning & Strategy
1. **Bright Surface Transition**:
   - `bg-slate-900` 요약 카드를 `bg-slate-50` 베이스로 전환. `border-slate-100`을 활용하여 밝고 정돈된 느낌을 줌.
   - 내부 지표 박스들을 `bg-white`와 `shadow-sm` 조합으로 변경하여 입체감 확보.
2. **Typography Alignment**:
   - 다크 배경의 `text-white/x` 조합을 슬레이트 기반 고대비 텍스트(`text-slate-900`, `text-slate-400`)로 전환.
   - 롤백 상태 등 핵심 지표의 컬러 강조(`text-emerald-600`, `text-amber-600`)는 유지.
3. **Selective Dark Retention**:
   - 로그 성격의 "Skip Details" 항목은 밝은 배경(`bg-white`)으로 옮기되, 데이터의 원문 성격을 유지하도록 폰트 및 스타일 조정.

## Summary of Changes
- **`BackupClient.tsx`**: 
  - '복원 결과 요약' 카드 배경을 `bg-slate-900` → `bg-slate-50`으로 전환.
  - 내부 지표(localStorage, Server Files 등) 박스를 `bg-white`로 변경.
  - '검증 이슈 발견' 블록을 밝은 로즈 테마(`bg-rose-50`, `text-rose-600`)로 수정.
  - 'Skip Details' 리스트를 밝은 카드 스타일로 재정의하여 가독성 개선.

## Verification Results
- **git diff --check**: 트레일링 공백 및 스타일 이슈 없음 확인.
- **pnpm build**: 성공. 백업/복원/롤백 로직 영향 없음을 확인.

## Files Exclusion
- `src/lib/backup/**`: 백업 엔진 및 검증 로직 보호를 위해 제외.
- `.data/finlife_*_snapshot.json`, `analysis_docs/**`: 데이터 보호를 위해 제외.
- `docs/frontend-design-spec.md`, `src/app/globals.css`, `work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`: 로컬 설정 보호를 위해 제외.

## Remaining Risks
- **Visual Distinction**: 복원 전(Preview)과 복원 후(Summary) 카드 스타일이 모두 밝은 베이스이므로, 상태 변화를 사용자가 명확히 인지하는지 추가 피드백 필요.
