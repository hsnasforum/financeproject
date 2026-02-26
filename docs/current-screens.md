# 현재 제공 화면/기능 카탈로그 (1페이지)

기준일: 2026-02-25  
기준 소스: `src/app/**/page.tsx`

## Public 화면
- `/`
- `/benefits`
- `/gov24`
- `/help`
- `/housing/afford`
- `/housing/subscription`
- `/invest/companies`
- `/planner`
- `/products`
- `/products/credit-loan`
- `/products/catalog`
- `/products/deposit`
- `/products/mortgage-loan`
- `/products/pension`
- `/products/rent-house-loan`
- `/products/saving`
- `/public/dart`
- `/recommend`
- `/settings/data-sources`
- `/tools/fx`

## Dev/Debug 화면
- `/debug/unified`
- `/dev/data`
- `/dev/finlife/schema`
- `/dev/git`
- `/dev/public-apis`

## 정합성 체크 규칙
- 헤더/홈/카탈로그 문서의 내부 링크(`href`)는 반드시 위 실존 경로만 가리킨다.
- 문서에 적힌 UI 경로는 `src/app/**/page.tsx`가 존재하지 않으면 즉시 제거하거나 `API only`로 명시한다.
- 비어 있는 화면이라도 링크를 유지하려면 최소 안내/기능(예: Help, DART 조회) 페이지를 제공한다.
