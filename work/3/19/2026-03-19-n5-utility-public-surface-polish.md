# 2026-03-19 N5 utility public surface polish

## 변경 파일
- `src/app/help/page.tsx`
- `src/components/HousingAffordClient.tsx`
- `src/components/SubscriptionClient.tsx`
- `src/components/InvestCompaniesClient.tsx`
- `src/components/FxToolClient.tsx`

## 사용 skill
- `planning-gate-selector`: utility 배치가 route/contract 변경 없는 UI text/helper 조정인지 확인하고 `git diff --check`, `pnpm lint`, `pnpm build`까지만 실행하도록 검증 범위를 고정했다.
- `dart-data-source-hardening`: `InvestCompaniesClient`의 DART/public helper와 인덱스 누락 안내가 raw 운영 정보보다 사용자용 안내를 먼저 보여 주도록 점검했다.
- `work-log-closeout`: 오늘 N5 `/work` 형식에 맞춰 변경 파일, 실행한 검증, 미실행 검증, 남은 리스크를 정리했다.

## 변경 이유
- `/help`, `/housing/afford`, `/housing/subscription`, `/invest/companies`, `/tools/fx`가 현재 기준 비교 화면이라는 설명보다 기능 이름이나 운영성 문구가 먼저 읽히는 부분이 남아 있었다.
- utility/public surface를 독립 운영 화면처럼 보이게 하지 않고, 현재 조건 기준 비교와 다음 확인 행동을 돕는 화면으로 읽히게 정리할 필요가 있었다.
- `/compare`는 redirect-only route라 이번 배치에서 코드 변경 없이 기존 `/products/compare` polish 상태를 유지했다.

## 핵심 변경
- `/help`에 `도움말을 읽는 기준` helper를 추가해 앱 결과가 확정 답안이 아니라 비교용 참고 정보라는 점과 상세/원문 재확인 필요성을 먼저 설명했다.
- `HousingAffordClient`는 계산 결과를 `현재 조건 기준`으로 다시 읽게 하고, 리스크와 CTA를 `다음에 확인할 곳` 흐름으로 바꿨다.
- `SubscriptionClient`는 공고 결과를 `현재 조회 조건 기준 후보`로 설명하고, 목록/상세/공고문 CTA를 `요약 보기`, `공고문 다시 확인` 중심으로 정리했다.
- `InvestCompaniesClient`는 DART 회사 검색을 `공시 확인 출발점` 톤으로 정리하고, 인덱스 누락 시 raw 수동 복구 가이드는 disclosure 아래로 내렸다.
- `FxToolClient`는 환산 결과를 `현재 기준 환율` 기반 비교 결과로 설명하고, 영문 helper와 확정적으로 읽히는 문구를 한국어 비교/참고 톤으로 바꿨다.

## 검증
- 실행한 검증
- `git diff --check -- src/app/compare/page.tsx src/app/help/page.tsx src/app/housing/afford/page.tsx src/app/housing/subscription/page.tsx src/app/invest/companies/page.tsx src/app/tools/fx/page.tsx`
- `git diff --check -- src/components/HousingAffordClient.tsx src/components/SubscriptionClient.tsx src/components/InvestCompaniesClient.tsx src/components/FxToolClient.tsx`
- `pnpm lint` (`0 errors`, 기존 warning 30건 유지)
- `pnpm build`
- 미실행 검증
- `pnpm e2e:rc` (`selector/flow` 구조를 의미 있게 바꾸지 않아 미실행)
- `pnpm e2e:rc:dart` (`DART/public helper 문구만 조정했고 검색/상세 selector 흐름은 바꾸지 않아 미실행)

## 남은 리스크
- `InvestCompaniesClient`는 여전히 인덱스 누락 시 개발용 자동 생성/수동 복구 기능을 함께 포함하므로, disclosure만으로 public first 위계가 충분한지 사용성 확인이 더 필요하다.
- `HousingAffordClient`와 `SubscriptionClient`의 helper 문구가 작은 화면에서 다소 길게 느껴질 수 있다.
- `/compare`는 redirect-only route라 이번 배치에서 직접 손대지 않았고, 별도 compare surface 추가 조정이 필요하면 `/products/compare` 기준으로 다음 라운드에서 다시 판단해야 한다.
