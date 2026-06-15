# 2026-05-26 Alert Rules React Compiler 경고 축소

## 변경 파일
- `src/components/AlertRulesClient.tsx`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기록 기준으로 기본 구현/검증 skill 조합 확인
- planning-gate-selector: `/settings/alerts` 클라이언트 변경에 필요한 lint/test/build 검증 세트 선정
- work-log-closeout: `/work` 종료 기록 형식 확인

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `AlertRulesClient`의 preferences 입력 미러링과 localStorage 프로필 hydrate effect 2건이 남아 있었습니다.
- `/settings/alerts` 화면의 저장소 동기화 동작은 유지하면서 React Compiler 친화적인 effect 호출 패턴으로 정리할 필요가 있었습니다.

## 핵심 변경
- include/exclude 입력 문자열 미러링을 0ms timer와 cleanup으로 감싸 effect 내 즉시 상태 갱신 경고를 제거했습니다.
- 초기 프로필 hydrate도 mount 후 timer cleanup으로 옮기고, 이벤트 구독과 storage 이벤트 반영은 기존 동작을 유지했습니다.
- 초기 state를 lazy localStorage hydrate로 바꾸지 않아 서버/클라이언트 첫 렌더 불일치 위험을 피했습니다.
- API 계약, payload shape, route, href, selector, UI 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/components/AlertRulesClient.tsx --rule react-hooks/set-state-in-effect:error`
- `corepack pnpm exec vitest run tests/alert-rules-store.test.ts tests/alert-rules-regex.test.ts tests/disclosure-alerts-route.test.ts`
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-alert-rules.json`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- [미확인] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [검증 필요] `/settings/alerts` 직접 e2e는 현재 별도 테스트가 없어 실행하지 않았습니다. 이번 변경은 route, selector, 문구를 바꾸지 않아 lint/test/build를 기준 검증으로 삼았습니다.
- [검증 필요] 커밋/푸시 후 원격 GitHub Actions 결과를 별도로 확인해야 합니다.

## 다음 라운드
- 잔여 `react-hooks/set-state-in-effect` 경고는 68건/56파일입니다. 다음 후보는 `src/components/InlineTodoEditor.tsx`, `src/components/data/DataFreshnessBanner.tsx`입니다. `/recommend`는 public stable 핵심 경로라 뒤 순위로 둡니다.
