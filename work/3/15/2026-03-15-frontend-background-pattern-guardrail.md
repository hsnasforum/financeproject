# Frontend Guardrail Update: Background Pattern Ban (2026-03-15)

## 수정 대상 파일
- `docs/frontend-design-spec.md`
- `src/app/globals.css`

## 변경 이유
- 최근 UI sweep에서 밝은 1안 베이스 위에 체크패턴/격자 배경이 섞이면서 제품 신뢰감보다 장식성이 더 강하게 느껴지는 문제가 있었다.
- 이 규칙을 문서에 명시하지 않으면 이후 Gemini UI 배치에서 같은 패턴이 다시 재도입될 가능성이 높았다.
- 실제 전역 배경에도 패턴 이미지가 걸려 있어 문서뿐 아니라 코드에서도 함께 제거할 필요가 있었다.

## 적용 내용
1. `frontend-design-spec`에 아래 가드레일을 추가했다.
- 전역 배경은 `Slate 50` 단색 또는 매우 약한 gradient까지만 허용
- 바둑판, 격자, 노트지, 체크 패턴, 반복 텍스처 배경 금지
- 시각적 리듬은 배경 무늬가 아니라 카드, 타이포, 여백, emerald/slate 강조, 작은 시각화로 해결

2. 디자인 참고 방향을 명시했다.
- 토스뱅크의 정돈된 여백, 쉬운 문장, 자신감 있는 타이포그래피, 과하지 않은 인터랙션 밀도를 참고
- 단, 외부 서비스 문구/레이아웃/그래픽은 그대로 복제하지 않음

3. 전역 코드 반영
- `src/app/globals.css`의 `body` 배경 이미지(`'/nb/bg-pattern.png'`)를 제거

## 실행한 검증
- `git diff --check -- docs/frontend-design-spec.md src/app/globals.css work/3/15/2026-03-15-frontend-background-pattern-guardrail.md`

## 미실행 검증
- `pnpm lint`
- `pnpm build`
- 이번 변경은 전역 CSS 1건과 문서 수정으로 범위가 작지만, 실제 화면 확인은 다음 UI batch 또는 로컬 확인에서 보는 편이 안전함

## 남은 리스크
- 개별 화면 컴포넌트가 자체 배경 패턴을 별도로 갖고 있으면 후속 batch에서 개별 제거가 추가로 필요할 수 있음
- 이번 수정은 전역 패턴 제거와 문서 규칙화에 집중했고, 각 화면의 세부 tone 보정은 포함하지 않음

## 다음 라운드 메모
- 다음 Gemini CLI 프롬프트부터는 `체크패턴/격자 배경 금지`를 상단 원칙에 포함하는 것이 안전함
