# 2026-03-11 data-sources-user-impact-and-opendart-env-alias

## 내부 회의 결론
- `.env.local`의 외부 API는 사용자 질문 기준으로 묶는 편이 운영과 제품 설명에 더 유리하다고 판단했다.
- 이번 라운드의 최소 고가치 수정은 `/settings/data-sources`에서 "이 API가 사용자에게 어떤 도움을 주는지"를 바로 설명하는 것이다.
- 동시에 실제 리스크 하나를 확인했다. `.env.local`에는 `OPENDART_API_URL`이 있는데 일부 DART 코드는 `OPENDART_BASE_URL`만 읽고 있었다.

## API 활용 안건 정리
- `FINLIFE`, `KDB`: 예금·적금·대출 비교와 상품 탐색
- `MOIS`, `MOLIT`, `REB`: 정부지원, 주거 의사결정, 청약·실거래 참고
- `EXIM`: 환율 참고 도구
- `OPENDART`: 기업 공시 검색과 모니터링
- `BOK_ECOS`: 재무설계 가정의 기준 금리·지표 보강
- `NPS`, `FSS`, `FSC`, `FRED`, `KOSIS`: 후속 확장 후보로 유지

## 변경 내용
1. `/settings/data-sources`에 "사용자 도움 연결" 섹션을 추가했다.
2. 데이터 소스별로 어떤 사용자 경로와 질문을 돕는지 카드로 정리했다.
3. DART base URL 해석을 `OPENDART_BASE_URL` 우선, `OPENDART_API_URL` 레거시 alias fallback 순으로 통일했다.
4. 관련 unit test를 추가하고 DART 문서의 env 설명을 갱신했다.

## 수정 파일
- `src/app/settings/data-sources/page.tsx`
- `src/lib/dataSources/userImpact.ts`
- `src/lib/publicApis/dart/baseUrl.ts`
- `src/lib/publicApis/dart/fetch.ts`
- `src/lib/publicApis/dart/company.ts`
- `src/app/api/public/disclosure/list/route.ts`
- `tests/data-source-user-impact.test.ts`
- `tests/dart-base-url-env.test.ts`
- `docs/opendart-setup.md`
- `docs/deploy.md`

## 검증
- `pnpm exec eslint src/app/settings/data-sources/page.tsx src/lib/dataSources/userImpact.ts src/lib/publicApis/dart/baseUrl.ts src/lib/publicApis/dart/fetch.ts src/lib/publicApis/dart/company.ts src/app/api/public/disclosure/list/route.ts tests/data-source-user-impact.test.ts tests/dart-base-url-env.test.ts`
- `pnpm test tests/data-source-user-impact.test.ts tests/dart-base-url-env.test.ts`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm e2e:rc`

## 결과
- targeted eslint PASS
- targeted test PASS
- `pnpm lint` PASS
- `pnpm test` PASS
- `pnpm build` PASS
- `pnpm e2e:rc` PASS

## 남은 리스크
- 이번 라운드 범위에서 재현된 미해결 리스크는 없다.
- [가정] `NPS`, `FRED`, `KOSIS` 등은 아직 사용자 경로에 직접 연결되지 않은 확장 후보이므로, 실제 노출 전에 freshness와 문구 기준을 다시 정해야 한다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
