# 2026-03-11 /settings/data-sources read-only health / RC / ops 결정 라운드

## 변경 전 정리
1. 수정 대상 파일
   - `src/lib/dataSources/impactHealth.ts`
   - `src/components/DataSourceImpactCardsClient.tsx`
   - `src/app/settings/data-sources/page.tsx`
   - `tests/data-source-impact-health.test.ts`
   - `tests/e2e/data-sources-settings.spec.ts`
   - `docs/data-sources-settings-ops.md`
   - `docs/api-utilization-draft.md`
2. 변경 이유
   - OPENDART/planning처럼 ping 버튼이 없는 소스도 사용자 도움 카드에 최신 기준 시각을 붙일지 검토했고, 실제 연결 테스트와 혼동되지 않게 read-only 의미를 분리할 필요가 있었다.
   - `tests/e2e/data-sources-settings.spec.ts`를 기본 `pnpm e2e:rc`에 둘지 결정해야 했다.
   - `/settings/data-sources` 운영 체크리스트를 단일 기준 문서로 고정할 필요가 있었다.
3. 실행할 검증 명령
   - `pnpm test tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts tests/data-sources-status.test.ts`
   - `pnpm lint`
   - `pnpm build`
   - `pnpm e2e:rc`

## 내부 회의 결론
1. OPENDART/planning read-only 기준 노출
   - 붙인다.
   - 단, `최근 연결 확인`으로 보이지 않게 별도 read-only 블록 `운영 최신 기준`으로 분리한다.
   - DART는 회사 검색 인덱스 생성 시각과 인덱스 건수만 보여주고, 신규 공시 접수시각과는 다르다고 명시한다.
   - planning은 스냅샷 기준일(`asOf`)과 최신 동기화 시각(`fetchedAt`)을 같이 보여준다.
2. `data-sources-settings.spec.ts`의 RC 기본 묶음 포함 여부
   - 유지한다.
   - 이유: `/settings/data-sources`는 `docs/current-screens.md`에 있는 실제 화면이고, OPENDART/planning read-only 기준과 ping 반영 계약을 함께 잡는 회귀 가치가 충분하다.
   - 빠른 재검증용으로 `pnpm e2e:rc:data-sources`는 계속 병행한다.
3. 운영 체크리스트 문서
   - 별도 문서가 필요하다.
   - canonical 문서는 `docs/data-sources-settings-ops.md`로 유지한다.

## 변경 후
1. 무엇이 바뀌었는지
   - 사용자 도움 카드의 ping 없는 소스 블록을 `운영 최신 기준`으로 정리하고, 시간 라벨을 `검색 인덱스 생성`, `최신 동기화`처럼 실제 의미에 맞게 노출했다.
   - E2E와 단위 테스트를 새 문구와 planning 카드 표시까지 포함하도록 보강했다.
   - 운영 문서에 read-only 기준 해석과 `pnpm e2e:rc` 기본 포함 근거를 기록했다.
2. 재현 또는 검증 방법
   - `pnpm test tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts tests/data-sources-status.test.ts`
   - `pnpm lint`
   - `pnpm build`
   - `pnpm e2e:rc`
3. 남은 리스크와 엣지케이스
   - DART `generatedAt`은 회사 검색 인덱스 기준이라 실제 신규 공시 최신 시각과 다를 수 있다.
   - planning `asOf`와 `fetchedAt`은 의미가 다르므로 둘 중 하나만 단독으로 해석하면 오해할 수 있다.
   - data-sources E2E는 dev 런타임 기준 회귀라 production 전용 문제를 직접 대체하지는 않는다.

## 이번 라운드 완료 항목
1. ping 없는 소스의 read-only 최신 기준 노출 방식을 실제 의미에 맞게 정리
2. `data-sources-settings.spec.ts`의 기본 `e2e:rc` 포함 여부를 검증과 함께 확정
3. `/settings/data-sources` 전용 운영 체크리스트를 canonical 문서 기준으로 정리

## 다음 라운드 우선순위
1. 필요 시 production에서도 read-only 최신 기준을 제한적으로 노출할지 별도 정책 결정
2. `DataSourceHealthTable`의 `impactHealthByCardId` 메타를 운영 화면에서 추가 활용할지 검토
3. data-sources 화면의 mock/replay 의존 구간을 더 명시적으로 문서화할지 검토

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
