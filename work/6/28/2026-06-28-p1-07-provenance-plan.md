# 2026-06-28 P1-07 public API provenance 계획 기록

## 변경 파일
- 없음. 이번 라운드는 구현 전 영향 범위 확인과 실행 분해만 수행했습니다.

## 사용 skill
- `planning-gate-selector`: public API provider/route/UI/health 변경에 필요한 검증 게이트를 최소 세트로 분류했습니다.
- `work-log-closeout`: `/work` 기록 형식과 필수 항목을 맞췄습니다.

## 변경 이유
- P1-07은 public API 성공 계약에 `provenance`를 필수화하고 mock/degraded 노출 방식을 바꾸는 작업이라 provider, route, cache meta, health UI, 데이터 소스 상태를 함께 봐야 합니다.
- 구현 전에 실제 로컬 env inventory와 기존 mock/fallback 동작 지점을 확인해야 수정 범위를 과도하게 넓히지 않을 수 있습니다.

## 핵심 변경
- `tests/public-api-provenance.test.ts`가 이미 추가되어 있으나 아직 실행 전 상태임을 확인했습니다.
- 실제 구현 영향 축을 `src/lib/publicApis/contracts/types.ts`, `src/lib/publicApis/providers/fx.ts`, `src/lib/publicApis/providers/housing.ts`, `src/app/api/public/fx/route.ts`, `src/app/api/public/housing/sales/route.ts`, `src/app/api/dev/data-sources/health/route.ts`, `src/app/settings/data-sources/page.tsx`로 좁혔습니다.
- `(mock)` 문자열 파싱/표시에 의존하는 현재 source 필드 관행이 provider 레벨에 남아 있음을 확인했습니다.
- 로컬 `.env.local`에서는 `MOLIT_SALES_API_KEY`, `MOLIT_SALES_API_URL`만 확인됐고 `KEXIM_API_KEY`, `KEXIM_FX_API_URL`, `PUBLIC_APIS_FALLBACK_TO_MOCK`는 확인되지 않았습니다. 값은 기록하지 않았습니다.
- 직전 `/work` 기준 최신 최종 검증은 `2026-06-28-p1-06-deposit-protection.md`의 `corepack pnpm build` PASS였습니다.

## 검증
- 실행한 확인:
  - `Get-Content -Raw .codex/skills/planning-gate-selector/SKILL.md`
  - `Get-Content -Raw .codex/skills/work-log-closeout/SKILL.md`
  - `Get-ChildItem -Path work/6/28 -Filter *.md | Sort-Object LastWriteTime -Descending | Select-Object -First 5 | Format-Table -HideTableHeaders FullName,LastWriteTime`
  - `Get-Content -Raw work/6/28/2026-06-28-p1-06-deposit-protection.md`
  - `Get-Content -Raw tests/public-api-provenance.test.ts`
  - `Get-Content -Raw src/lib/publicApis/contracts/types.ts`
  - `Get-Content -Raw src/lib/publicApis/providers/fx.ts`
  - `Get-Content -Raw src/lib/publicApis/providers/housing.ts`
  - `Get-Content -Raw src/app/api/public/fx/route.ts`
  - `Get-Content -Raw src/app/api/public/housing/sales/route.ts`
  - `Get-Content -Raw src/app/api/dev/data-sources/health/route.ts`
  - `Get-Content -Raw src/app/settings/data-sources/page.tsx`
  - `Get-Content -Raw src/app/api/planner/assumptions/route.ts`
  - `Select-String -Path .env.local -Pattern '^(KEXIM_API_KEY|KEXIM_FX_API_URL|MOLIT_SALES_API_KEY|MOLIT_SALES_API_URL|PUBLIC_APIS_FALLBACK_TO_MOCK)=' | ForEach-Object { $_.Matches.Value -replace '=.*','=***' }`
  - `rg -n "PublicApiResult|DataProvenance|degradedReason|PUBLIC_APIS_FALLBACK_TO_MOCK|KEXIM_API_KEY|MOLIT_SALES_API_KEY|\\(mock\\)|provenance|mock" src/lib/publicApis src/app src/components tests --glob '!tmp/**'`
  - `rg -n "data-sources/health|impactHealth|healthSummary|latestCheckedAt|molit_sales|kexim|fx" src/app src/lib src/components tests --glob '!tmp/**'`
- 미실행 검증:
  - `corepack pnpm test tests/public-api-provenance.test.ts`
  - `corepack pnpm test tests/housing-provider.test.ts`
  - `corepack pnpm test` 내 public API 관련 확장 세트
  - `corepack pnpm lint`
  - `corepack pnpm build`
  - `corepack pnpm e2e:rc`

## 남은 리스크
- `fx`와 `housing` 외에도 `exchange`, `planner assumptions`, dev status/sample route가 같은 성공 계약 또는 source 노출 관행을 공유할 가능성이 있어 구현 중 추가 파급이 생길 수 있습니다.
- 현재 data-source health 집계는 provider configured/cooldown/snapshot 중심이라 provenance/degraded를 어디까지 노출할지 설계 정합성을 먼저 맞춰야 합니다.
- `.env.local` 기준 KEXIM 계열 키가 없어 로컬 재현은 mock/degraded 경로 위주가 될 가능성이 큽니다. live/cache 계약은 주입 테스트와 캐시 경로 검증이 중요합니다.
