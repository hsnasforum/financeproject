# Day 1 현재 제공 화면/기능 카탈로그 (1페이지)

기준일: 2026-02-25
목적: “지금 앱이 실제로 제공하는 것”만 고정하고 문서/홈/헤더의 사실 일치 여부를 점검한다.

## 1) Public 화면 (운영 카탈로그)
- `/`
- `/planner`
- `/recommend`
- `/products`
- `/products/deposit`
- `/products/saving`
- `/products/credit-loan`
- `/products/mortgage-loan`
- `/products/rent-house-loan`
- `/benefits`
- `/housing/subscription`
- `/settings/data-sources`

## 2) Dev/Debug 화면 (Day 1 범위)
- `/debug/unified`
- `/dev/data`
- `/dev/finlife/schema`
- `/dev/git`

## 3) 도메인 상태 (연금/주거/청약/혜택)
- `혜택`: `/benefits` 진입, 실제 렌더는 `/gov24` 리다이렉트 경로
- `청약`: `/housing/subscription` 제공
- `주거(매매/전월세)`: 전용 독립 페이지 없음, `/planner` 내부 모듈로 제공
- `연금`: 전용 독립 상품 페이지 없음, `/planner` 입력/점검 + API(`/api/finlife/pension`) 제공

## 4) 중복/정리 후보
- `/gov24`: 페이지는 존재(`src/app/gov24/page.tsx`)하지만 홈/헤더 기본 진입은 `/benefits`로 통일되어 사실상 우회 진입 경로
- `PlannerWizard`: 컴포넌트는 존재(`src/components/PlannerWizard.tsx`)하나 현재 `/planner` 라우트(`src/app/planner/page.tsx`)에서 사용하지 않음
- `PlannerClient`: `PlannerWizard`를 감싸지만 라우트에서 참조되지 않음

## 5) 정합성 점검 결과
- 라우트 인벤토리 기준: `src/app/**/page.tsx` 실존 경로 목록 추출 완료
- 링크 점검 파일:
`src/components/SiteHeader.tsx`
`src/app/page.tsx`
`src/app/products/page.tsx`
- `href="/..."` 검증 결과: 깨진 내부 링크 없음
- 문서 점검:
`docs/api-utilization-draft.md`의 FINLIFE UI 경로는 `/products/pension`을 포함하지 않으며, 연금은 API만 제공으로 기술되어 코드 상태와 일치

## 6) Day 1 운영 원칙
- 카탈로그에 없는 경로는 “추가 제공”으로 간주하지 않는다.
- UI 독립 화면이 없는 항목(연금/주거)은 반드시 대체 경로(`/planner` 또는 API)를 함께 적는다.
- 홈/헤더/문서가 서로 다른 진입 경로를 말하면 Day 1 실패로 본다.
