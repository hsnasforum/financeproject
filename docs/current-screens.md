# 현재 제공 화면/기능 카탈로그 (v1.0 RC)

기준일: 2026-02-26  
기준 소스: `src/app/**/page.tsx`

## Public 화면 (production 노출)
- `/` (홈, 핵심 바로가기만 제공)
- `/dashboard` (메인 진입점)
- `/benefits`
- `/compare`
- `/gov24`
- `/help`
- `/housing/afford`
- `/housing/subscription`
- `/invest/companies`
- `/planning`
- `/products`
- `/products/catalog`
- `/products/catalog/[id]`
- `/products/deposit`
- `/products/saving`
- `/products/pension`
- `/products/mortgage-loan`
- `/products/rent-house-loan`
- `/products/credit-loan`
- `/products/compare`
- `/public/dart`
- `/public/dart/company`
- `/recommend`
- `/recommend/history`
- `/report`
- `/settings/alerts`
- `/settings/data-sources`
- `/tools/fx`

## Dev/Debug 화면 (production 404)
- `/dashboard/artifacts`
- `/debug/unified`
- `/dev/data`
- `/dev/finlife/schema`
- `/dev/git`
- `/dev/public-apis`

## API 노출 규칙
- `/api/dev/*`는 production에서 공통 차단(404)된다.

## 정합성 체크 규칙
- 헤더/홈/문서의 내부 링크(`href`)는 반드시 위 실존 경로만 가리킨다.
- Dev/Debug 경로는 운영 문서/사용자 안내에서 기본 노출하지 않는다.
