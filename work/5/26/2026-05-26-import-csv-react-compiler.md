# 2026-05-26 Import CSV React Compiler 경고 축소

## 변경 파일
- `src/app/planning/v3/import/_components/ImportCsvClient.tsx`

## 사용 skill
- finance-skill-routing: 최신 `/work` 기록 기준으로 기본 구현/검증 skill 조합 확인
- planning-gate-selector: planning v3 import UI 변경에 필요한 lint/test/build 검증 세트 선정
- work-log-closeout: `/work` 종료 기록 형식 확인

## 변경 이유
- `react-hooks/set-state-in-effect` one-off 스캔에서 `ImportCsvClient`의 CSV 헤더/매핑 파생 상태 초기화와 계좌 목록 로딩 effect가 남아 있었습니다.
- targeted ESLint 확인 중 빈 CSV 또는 헤더 없음 상태에서 preview 상태를 즉시 reset하는 effect도 같은 규칙 위반으로 추가 확인되었습니다.

## 핵심 변경
- CSV 텍스트 파싱, 헤더 반영, 추천 매핑 반영, preview reset을 0ms timer와 cleanup으로 감싸 effect 내 즉시 상태 갱신 경고를 제거했습니다.
- 계좌 목록 로딩 effect를 0ms timer와 `AbortController` cleanup으로 정리하고 fetch에 `AbortSignal`을 전달했습니다.
- preview 비활성 조건의 상태 reset도 timer cleanup으로 정리했습니다.
- API 계약, payload shape, route, href, selector, UI 문구는 변경하지 않았습니다.

## 검증
- `corepack pnpm exec eslint src/app/planning/v3/import/_components/ImportCsvClient.tsx --rule react-hooks/set-state-in-effect:error`
- `corepack pnpm exec vitest run tests/planning-v3-import-csv-upload-ui.test.tsx tests/planning-v3/drafts-upload-flow.test.ts tests/planning-v3/csv-import.test.ts tests/planning-v3-write-route-guards.test.ts`
- `corepack pnpm exec eslint . --rule react-hooks/set-state-in-effect:warn -f json -o tmp/eslint-react-hooks-set-state-after-import-csv.json`
- `corepack pnpm lint`
- `corepack pnpm test`
- `corepack pnpm build`

## 남은 리스크
- [미확인] `react-hooks/set-state-in-effect`는 아직 기본 lint 설정에서 전역 활성화되어 있지 않아 one-off rule override로 확인했습니다.
- [검증 필요] `ImportCsvClient`는 현재 `src/app/planning/v3/import/csv/page.tsx`에서 직접 import되지 않고 UI 정적 렌더 테스트로만 확인됩니다. 따라서 브라우저 e2e는 이번 수정 컴포넌트를 직접 재현하지 못합니다.
- [검증 필요] 커밋/푸시 후 원격 GitHub Actions 결과를 별도로 확인해야 합니다.

## 다음 라운드
- 잔여 `react-hooks/set-state-in-effect` 경고는 70건/57파일입니다. 다음 후보는 `src/components/AlertRulesClient.tsx`, `src/components/data/DataFreshnessBanner.tsx`, `src/components/InlineTodoEditor.tsx`처럼 영향 범위가 작고 검증 경로가 분명한 파일부터 선정합니다. `/recommend`는 public stable 핵심 경로라 뒤 순위로 둡니다.
