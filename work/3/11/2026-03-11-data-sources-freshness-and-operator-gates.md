# 2026-03-11 data-sources-freshness-and-operator-gates

## 내부 회의 결론
- 이번 라운드의 최소 고가치 수정은 `/settings/data-sources`에 `기준 시점`과 `노출 전 체크`를 추가하는 것이다.
- 직전 라운드에서 연결 여부와 활용 방향은 정리됐지만, 운영자가 "이 값이 언제 기준인지"와 "어떤 조건을 충족해야 사용자에게 노출할지"를 한 번에 보기 어렵다는 공백이 남아 있었다.
- 운영 리스크는 문구/기준 시점 혼동과 build fallback 의미 혼동 두 축으로 보고, README에 `.next-build` fallback 안내도 같이 보강했다.

## 변경 내용
1. `사용자 도움 연결` 카드에 `기준 시점` 필드를 추가했다.
2. `확장 후보` 카드에 `노출 전 체크` 필드를 추가했다.
3. freshness 문구는 환율 영업일 기준, 혜택 공고 기준, 실거래 월 단위, DART 공시 접수 시점, planning snapshot asOf 기준으로 정리했다.
4. README에 `pnpm build`가 dev 서버 중이면 `.next-build`를 쓸 수 있고, 배포용 `.next`가 필요하면 dev 서버를 내리고 다시 build 하라는 안내를 추가했다.
5. 관련 helper test를 갱신했다.

## 수정 파일
- `src/lib/dataSources/userImpact.ts`
- `src/app/settings/data-sources/page.tsx`
- `tests/data-source-user-impact.test.ts`
- `docs/api-utilization-draft.md`
- `README.md`

## 검증
- `pnpm exec eslint src/app/settings/data-sources/page.tsx src/lib/dataSources/userImpact.ts tests/data-source-user-impact.test.ts`
- `pnpm test tests/data-source-user-impact.test.ts`
- `pnpm lint`
- `pnpm build`
- `pnpm e2e:rc`

## 결과
- targeted eslint PASS
- targeted test PASS
- `pnpm lint` PASS
- `pnpm build` PASS
- `pnpm e2e:rc` PASS

## 남은 리스크
- 이번 라운드 범위에서 재현된 미해결 리스크는 없다.
- [가정] freshness 문구는 현재 운영 가이드와 구현 정책을 요약한 것이다. 각 API별 실제 마지막 성공 시각(`asOf`, `fetchedAt`)을 카드에 실시간으로 붙이려면 별도 health payload 확장이 필요하다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
