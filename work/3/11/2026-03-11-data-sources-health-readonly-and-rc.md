# 2026-03-11 data-sources health readonly and rc

## 내부 회의 결론
- `/settings/data-sources`의 사용자 도움 카드는 ping 기반 `최근 연결 확인`과 server-side read-only `최근 상태 확인`을 분리하는 쪽이 안전합니다.
- ping 버튼이 없는 `OPENDART`, `planning`도 health API 기준의 최신 확인 시각과 기준값을 read-only로 붙일 수 있습니다. 다만 실제 연결 테스트처럼 보이지 않게 별도 블록과 문구를 유지해야 합니다.
- `tests/e2e/data-sources-settings.spec.ts`는 `pnpm e2e:rc` 기본 묶음에 포함하는 쪽으로 정리했습니다. 화면만 다시 볼 때는 `pnpm e2e:rc:data-sources`를 보조 명령으로 둡니다.
- 운영 문서는 `docs/data-sources-settings-ops.md`를 단일 기준 문서로 두고, `docs/data-sources-ops.md`는 포인터로 유지합니다.

## 변경 내용
1. `src/lib/dataSources/impactHealth.ts`
   - DART corp index `generatedAt/count`와 planning latest snapshot `asOf/fetchedAt`를 카드용 read-only health 모델로 정리했습니다.
2. `src/app/settings/data-sources/page.tsx`
   - DART index 상태와 planning latest snapshot을 읽어 `DataSourceImpactCardsClient`에 read-only 최신 상태로 주입했습니다.
   - 화면 설명 문구를 `최근 상태 확인` 기준으로 맞췄습니다.
3. `src/components/DataSourceImpactCardsClient.tsx`
   - 기존 `최근 연결 확인` 블록과 별도로 `최근 상태 확인` read-only 블록을 렌더링했습니다.
4. `src/app/api/dev/data-sources/health/route.ts`
   - health payload `meta`에 impact health 요약과 read-only health 맵을 함께 실었습니다.
5. `tests/data-source-impact-ping.test.ts`, `tests/data-source-impact-health.test.ts`
   - ping 전용 요약과 read-only health helper 회귀 테스트를 분리해 유지했습니다.
6. `tests/e2e/data-sources-settings.spec.ts`
   - DART read-only 블록이 보이는지 확인하고, ping 반영 검증은 `MOLIT_SALES`로 고정했습니다.
7. `README.md`, `docs/README.md`, `docs/api-utilization-draft.md`, `docs/opendart-setup.md`
   - `pnpm e2e:rc` 기본 묶음에 data-sources settings가 포함된다는 점과 전용 운영 문서 경로를 반영했습니다.
8. `docs/data-sources-settings-ops.md`, `docs/data-sources-ops.md`
   - `/settings/data-sources` 전용 운영 체크리스트를 기준 문서로 두고, 기존 파일은 포인터로 정리했습니다.

## 검증
- `pnpm test tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts tests/data-sources-status.test.ts`
  - PASS (`4 files / 14 tests`)
- `pnpm exec eslint src/app/settings/data-sources/page.tsx src/components/DataSourceImpactCardsClient.tsx src/lib/dataSources/impactHealth.ts src/app/api/dev/data-sources/health/route.ts tests/data-source-impact-health.test.ts tests/e2e/data-sources-settings.spec.ts`
  - PASS
- `pnpm e2e:pw tests/e2e/data-sources-settings.spec.ts --workers=1`
  - [blocked] Playwright webServer 기동 전에 `connect EPERM 127.0.0.1:3126`가 발생해 assertion 단계까지 가지 못했습니다.
- `node scripts/next_dev_safe.mjs --webpack --host 0.0.0.0 --port 3126 --strict-port`
  - [blocked] `listen EPERM: operation not permitted 0.0.0.0:3126`
- `pnpm build`
  - [blocked] `Creating an optimized production build ...` 이후 장시간 진행 중이라 PASS로 확정하지 않았습니다.

## 남은 리스크
- read-only `최근 상태 확인` 블록은 현재 `NODE_ENV !== "production"`일 때만 내려갑니다. 운영 노출 범위를 넓히려면 사용자 문구와 정보 노출 기준을 먼저 정리해야 합니다.
- DART read-only 블록은 API key가 없어도 corp index 생성 시각을 보여줍니다. 운영자에게는 유용하지만, 즉시 사용 가능 상태처럼 읽히지 않게 문구 유지가 중요합니다.
- E2E 실패 원인은 현재 코드보다 실행 환경의 로컬 포트 바인드 제한으로 보입니다. RC 재검증은 포트 바인드 가능한 환경에서 다시 확인해야 합니다.
- build 정체가 이번 수정과 무관한 저장소 공통 이슈인지, 특정 경로 회귀인지 아직 분리되지 않았습니다.

## 다음 라운드 우선순위
1. 포트 바인드 가능한 환경에서 `pnpm e2e:rc:data-sources`와 `pnpm e2e:rc`를 다시 돌려 기본 묶음 편입을 확정합니다.
2. `pnpm build` 정체 원인을 이번 변경 범위와 분리해 재현합니다.
3. production에서도 read-only `최근 상태 확인`을 제한적으로 보여줄지 운영 문구와 노출 기준을 정합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
