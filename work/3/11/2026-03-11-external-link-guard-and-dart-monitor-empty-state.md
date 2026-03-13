# 2026-03-11 External link guard and DART monitor empty state

## 수정 대상 파일
- `src/components/DartDisclosureMonitorClient.tsx`
- `tests/external-link-rel.test.ts`

## 변경 이유
- 새 탭 링크는 여러 화면에서 `noopener noreferrer`로 보강했지만, 다시 누락이 생겨도 자동으로 잡아주는 정적 검사가 없었습니다.
- DART 모니터 화면은 즐겨찾기 기업이 없을 때 plain 문장만 보여 검색/회사상세와 UX 톤이 달랐습니다.

## 이번 변경
1. `tests/external-link-rel.test.ts`를 추가해 `src` 아래 `target="_blank"` 태그는 항상 `rel="noopener noreferrer"`를 포함하도록 고정했습니다.
2. `DartDisclosureMonitorClient`의 빈 워치리스트 상태를 `EmptyState`로 바꿔 안내 문구와 시각 톤을 맞췄습니다.

## 재현 / 검증
- `pnpm test tests/external-link-rel.test.ts tests/middleware-security.test.ts`
- `pnpm exec eslint src/components/DartDisclosureMonitorClient.tsx tests/external-link-rel.test.ts`
- `pnpm e2e:pw tests/e2e/dart-flow.spec.ts --workers=1`

## 남은 리스크와 엣지케이스
- `target="_blank"` 정적 가드는 JSX 태그 문자열 기준 검사라, 앞으로 `rel`을 변수/표현식으로 우회하는 복잡한 패턴을 쓰면 별도 규칙이 더 필요할 수 있습니다.
- dev runtime noise(`/planning/reports 500`, `Fast Refresh had to perform a full reload`, `__webpack_modules__[moduleId] is not a function`)는 여전히 별도 축으로 남아 있습니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
