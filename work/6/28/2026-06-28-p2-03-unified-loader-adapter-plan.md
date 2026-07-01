# 2026-06-28 P2-03 unified loader adapter plan

## 변경 파일
- `work/6/28/2026-06-28-p2-03-unified-loader-adapter-plan.md`

## 사용 skill
- `finance-skill-routing`: 오늘 `/work` 흐름과 이번 라운드 성격이 분석 전용인지 확인하고 최소 skill 조합을 고르는 데 사용했습니다.
- `planning-gate-selector`: unified source adapter 분리 작업에 맞는 최소 검증 세트를 고르는 데 사용했습니다.
- `work-log-closeout`: `/work` 계획 노트 형식과 필수 기록 항목을 맞추는 데 사용했습니다.

## 변경 이유
- 통합 Markdown의 P2-03 범위를 구현 전에 3~5단계로 분해하고, 메인 작업과 병렬 조사/검증 범위를 분리해 다음 작업자가 안전하게 이어받도록 하기 위함입니다.
- `src/lib/sources/unified.ts`가 Prisma 조회, refresh, source별 매핑, merge, diagnostics, integrated mode를 함께 들고 있어 adapter 경계와 최소 검증 세트를 먼저 고정할 필요가 있습니다.
- 다른 작업자가 동시에 코드를 만질 수 있으므로 이번 라운드는 계획과 영향 범위 정리만 수행하고 기존 변경은 되돌리지 않았습니다.

## 직접 변경
- 코드 파일은 수정하지 않았고, P2-03 계획/영향 범위/검증 세트만 문서화했습니다.
- 예상 핵심 영향 파일을 `src/lib/sources/unified.ts`, 신규 loader 모듈들, `src/lib/sources/unifiedEnrichPolicy.ts`, 관련 unified route tests로 좁혔습니다.
- unified 중앙 service는 loader 선택, canonical enrichment, merge/deposit policy만 남기고 source별 refresh/query/mapping/pagination은 loader 내부로 이동시키는 방향으로 정리했습니다.
- 새 service 테스트는 fake loader로 DB/network 없이 merge/enrichment/protection mode를 검증하는 방향을 우선순위로 기록했습니다.

## 검증
- 실행한 검증: `git diff --check -- work/6/28/2026-06-28-p2-03-unified-loader-adapter-plan.md`
- 미실행 검증: `corepack pnpm test tests/products-unified-route.test.ts`
- 미실행 검증: `corepack pnpm test tests/unified-mode-validation.test.ts`
- 미실행 검증: `corepack pnpm lint`
- 미실행 검증: `corepack pnpm typecheck`

## 남은 리스크
- `getUnifiedProductById`가 같은 파일 안에서 source별 lookup/merge를 계속 직접 수행하므로, 목록용 loader 분리 후에도 item 조회 경계가 남을 수 있습니다.
- samplebank는 Prisma가 아닌 provider 실행 기반이라 cursor/pagination 의미가 다른데, loader 계약을 너무 단순화하면 source 간 pageInfo 의미가 어긋날 수 있습니다.
- integrated mode의 KDB enrichment diagnostics와 `includeKdbOnly` extras는 현재 finlife canonical 경로에 강하게 묶여 있어 service/loader 경계 분리를 잘못하면 P1-06 depositProtection 일관성이 깨질 수 있습니다.
- 다음 라운드 우선순위: 1) loader contract 초안 고정 2) finlife/kdb/samplebank별 mapping 책임 이동 3) fake loader service test 추가 4) 최소 검증 실행
