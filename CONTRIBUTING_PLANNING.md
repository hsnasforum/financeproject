# Contributing: Planning SSOT Rules

Planning 변경은 아래 SSOT(single source of truth) 규칙을 따릅니다.

## 1) SSOT Modules

- `src/lib/planning/calc/**`
  - 모든 금융 계산식(이자/상환/DSR/반올림/세율 가정)
  - `roundingPolicy`, `taxPolicy` 포함
- `src/lib/planning/catalog/**`
  - 경고/액션/정책/문구(catalog + copy)
  - UI/리포트는 카탈로그 결과만 소비
- Evidence(설명 가능성)
  - 사용자에게 노출되는 새 지표는 Evidence(공식+입력+가정)를 반드시 제공
  - raw JSON dump로 대체 금지

## 2) When You Add X, You Must Also Add Y

### A. New warning code
1. warning emit 추가
2. `catalog/warningCatalog` 매핑 추가
3. 연관 `actionId`가 있으면 `catalog/actionCatalog` 매핑 추가
4. 테스트 추가
   - 경고 코드 매핑 테스트
   - unknown fallback 테스트(필요 시)

### B. New user-facing metric
1. 계산식은 `calc/**`에 추가/수정
2. Evidence builder에 항목 추가(공식/입력/가정)
3. UI drilldown(근거 패널) 연결
4. 테스트 추가
   - evidence 존재
   - 단위/포맷 검증

### C. Calc change
1. `calc/**`만 수정
2. 레퍼런스 테스트(고정 fixture/snapshot) 갱신
3. 영향받는 VM/UI 테스트 확인

## 3) Required Gates

- `pnpm test`
- `pnpm planning:v2:complete`
- `pnpm planning:ssot:check`

권장:

- `pnpm planning:v2:regress`
- `pnpm planning:v2:report:test`
- `pnpm planning:v2:guide:test`

## 4) Guard Policy (Best Effort)

`scripts/planning_ssot_guard.mjs`는 다음 우회 패턴을 탐지합니다.

1. `core/v2/debt/calc` 직접 import (calc 외부)
2. `lib/finlife/calculators` 직접 import (calc 외부)
3. `src/lib/planning/**`에서 `Math.round`/`Math.floor` 직접 사용 (calc 외부)

허용 예외:

- `src/lib/planning/calc/**`

## 5) PR Checklist

- [ ] SSOT 위치 규칙을 지켰는가?
- [ ] 새 warning/metric/calc 변경에 대응하는 테스트를 추가했는가?
- [ ] `pnpm planning:ssot:check` 실행 결과를 확인했는가?
- [ ] `pnpm test` + `pnpm planning:v2:complete` 결과를 확인했는가?
