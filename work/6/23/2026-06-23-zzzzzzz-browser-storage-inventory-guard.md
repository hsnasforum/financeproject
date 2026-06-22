# 2026-06-23 Browser storage inventory guard

## 변경 파일
- `docs/browser-storage-inventory.json`
- `scripts/browser_storage_inventory_check.mjs`
- `package.json`

## 사용 skill
- `finance-skill-routing`: 이번 라운드 적용 skill 범위 선정.
- `planning-gate-selector`: 문서/스크립트/package script 변경에 맞는 검증 세트 선정.
- `work-log-closeout`: 종료 기록 형식과 남은 리스크 정리.
- `gpt-5.3-codex-spark` + `xhigh`: 브라우저 저장소 참조 파일 정적 분류 보조.

## 변경 이유
- 이전 `/work` 후속 메모의 브라우저 저장소 참조 44개 수치는 현재 `src/**/*.{ts,tsx}` 재스캔 결과와 맞지 않았습니다.
- 현재 기준 실제 참조 파일은 35개이며, Frontend/RSC 안정화 전에 영구 사용자 설정, 임시 draft/cache, dev/ops unlock, legacy fallback 성격을 분리해 둘 필요가 있었습니다.
- 새 `localStorage`/`sessionStorage` 참조가 추가될 때 분류 누락을 PR 단계에서 잡을 수 있도록 가드를 추가했습니다.

## 핵심 변경
- `docs/browser-storage-inventory.json`에 현재 35개 참조 파일의 storage 종류, 분류, 용도, RSC 전환 계획을 기록했습니다.
- `scripts/browser_storage_inventory_check.mjs`를 추가해 `src`의 실제 브라우저 저장소 참조와 manifest가 정확히 일치하는지 검증하게 했습니다.
- `package.json`에 `browser-storage:check` 스크립트를 추가했습니다.
- 사용자 경로, API route, 화면 문구, 런타임 동작은 변경하지 않았습니다.

## 검증
- `node --check scripts/browser_storage_inventory_check.mjs` PASS
- `corepack pnpm browser-storage:check` PASS (`files=35`)
- `corepack pnpm lint` PASS
- `corepack pnpm typecheck` PASS
- `corepack pnpm test` PASS (`721` files, `2335` tests)
- `corepack pnpm build` PASS
- `git diff --check` PASS

## 남은 리스크
- 가드는 정적 문자열 스캔입니다. `localStorage`/`sessionStorage` 문자열 없이 간접 주입되는 Storage 접근은 잡지 못합니다.
- 이번 라운드는 분류와 회귀 가드 추가까지이며, 실제 RSC/server initial data 이전은 하지 않았습니다.
- 44개 수치는 과거 `/work` 메모의 후속 우선순위 표현으로 확인됐고, 현재 근거 있는 수치는 35개입니다.

## 다음 라운드 우선순위
- planning workspace profile/beginner mode 같은 영구 사용자 설정부터 URL 또는 서버 초기 데이터 경계로 이동합니다.
- data-source ping snapshot/cache는 서버 freshness/status 초기 데이터와 연결해 임시 cache 의존도를 줄입니다.
- product/recommend/planner 계열 legacy fallback key는 호환 기간과 제거 조건을 별도 deprecation 계획으로 분리합니다.
