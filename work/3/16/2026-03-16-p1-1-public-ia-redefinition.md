# P1-1 Public IA 재정의 1차 배치

## 이번 배치 대상 항목 ID
- `P1-1`

## 변경 파일
- `src/components/SiteHeader.tsx`
- `src/components/ui/MobileBottomNav.tsx`
- `src/components/home/ServiceLinks.tsx`
- `docs/current-screens.md`
- `analysis_docs/v2/financeproject_next_stage_plan.md`

## 핵심 변경
- public 헤더를 `홈 / 재무진단 / 상품추천 / 금융탐색 / 내 설정` 5개 상위 메뉴 기준으로 정리했다.
- 모바일 하단 네비게이션도 같은 5개 축으로 맞추고, `금융탐색`이 `products / benefits / public / housing / tools / invest` 계열에서 활성화되도록 조정했다.
- 홈 `ServiceLinks`를 세부 화면 나열 대신 5개 상위 IA 바로가기 기준으로 바꿨다.
- `docs/current-screens.md` 상단에 2026-03-16 기준 Public IA 고정 원칙을 추가했다.
- `P1-1` 상태는 RC E2E 광범위 실패 때문에 `[진행중]`으로 유지했다.

## 실행한 검증
- `git diff --check -- src/components/SiteHeader.tsx src/components/ui/MobileBottomNav.tsx src/components/home/ServiceLinks.tsx docs/current-screens.md`
- `pnpm planning:current-screens:guard`
- `pnpm build`
- `pnpm e2e:rc`

## 남은 리스크
- `pnpm e2e:rc`가 이번 변경 파일과 직접 겹치지 않는 DART, data-sources, planning quickstart, recommend smoke에서 광범위 실패했다.
- `P1-1`은 상위 IA 구조는 반영됐지만 RC 기준 closeout은 아직 못 했다.
- `금융탐색` 대표 경로를 현재는 `/products`로 두었고, 별도 탐색 허브 신설은 하지 않았다.

## 다음 우선순위
- `P1-2 route policy 문서화`

## 사용한 skill
- `route-ssot-check`: public IA와 current-screens 기준 충돌 여부 점검
- `planning-gate-selector`: nav/page/doc 변경에 맞는 최소 검증 세트 선택
- `work-log-closeout`: `/work` closeout 기록 형식 유지
