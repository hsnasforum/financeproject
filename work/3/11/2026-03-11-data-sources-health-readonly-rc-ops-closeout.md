# 2026-03-11 data-sources health readonly rc ops closeout

## 변경 이유
- `/settings/data-sources`의 사용자 도움 카드에는 ping 기반 `최근 연결 확인`만 있어, ping 버튼이 없는 `OPENDART`와 `planning`은 최신 기준 시각을 바로 보여주지 못했습니다.
- settings 전용 e2e가 생겼지만 RC 기본 묶음 편입 여부와 운영 문서 기준이 분명하지 않아, 검증 루틴과 운영 체크리스트를 같이 정리할 필요가 있었습니다.

## 이번 라운드 내부 회의 결론
1. ping이 없는 축은 `최근 연결 확인`으로 흉내 내지 않고, health 기반 read-only `최근 상태 확인`을 별도 블록으로 유지한다.
2. `tests/e2e/data-sources-settings.spec.ts`는 `/settings/data-sources` 핵심 회귀를 잡으므로 `pnpm e2e:rc` 기본 묶음에 포함한다.
3. 운영 문서는 `/settings/data-sources` 전용 체크리스트를 기준 문서로 두고, 주변 문서는 그 문서를 가리키는 방식으로 정리한다.

## 무엇이 바뀌었는지
1. `src/lib/dataSources/impactHealth.ts`
   - DART corp index `generatedAt/count`와 planning latest snapshot `asOf/fetchedAt`를 read-only health 모델로 정리했습니다.
   - dev health API가 같이 쓸 수 있는 summary map도 유지했습니다.
2. `src/app/settings/data-sources/page.tsx`
   - `OpenDART` index 상태와 planning latest snapshot을 읽어 사용자 도움 카드에 주입하도록 바꿨습니다.
3. `src/components/DataSourceImpactCardsClient.tsx`
   - `최근 연결 확인`과 별도로 read-only `최근 상태 확인` 블록을 렌더링하도록 보강했습니다.
4. `tests/data-source-impact-health.test.ts`
   - read-only health helper 회귀를 추가했습니다.
5. `tests/e2e/data-sources-settings.spec.ts`
   - DART/planning read-only health 블록 존재를 같이 확인하도록 보강했습니다.
6. `package.json`
   - `pnpm e2e:rc`와 `pnpm e2e:rc:dev-hmr`에 settings spec을 포함했습니다.
   - 화면만 빠르게 다시 볼 수 있게 `pnpm e2e:rc:data-sources`를 추가했습니다.
7. `README.md`, `docs/README.md`, `docs/api-utilization-draft.md`, `docs/opendart-setup.md`
   - RC 기본 묶음과 data-sources 전용 운영 문서 경로를 반영했습니다.
8. `docs/data-sources-settings-ops.md`, `docs/data-sources-ops.md`
   - `/settings/data-sources` 운영 체크리스트를 분리하고, 포인터 문서와 기준 문서를 나눴습니다.

## 검증
- `pnpm test tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts`
  - PASS (`3 files / 11 tests`)
- `pnpm lint`
  - PASS
- `pnpm exec tsc --noEmit`
  - PASS
- `curl -I --max-time 20 http://127.0.0.1:3100/settings/data-sources`
  - PASS (`200 OK`, 수동 dev 서버 기준)
- `pnpm build`
  - [검증 필요] webpack compile 단계까지는 반복 확인했지만, 현재 CLI 세션에서는 full build 종료 코드를 안정적으로 회수하지 못했습니다.
- `pnpm e2e:pw tests/e2e/data-sources-settings.spec.ts --workers=1`
  - [blocked] Playwright 자체가 Chromium launch 단계에서 `sandbox_host_linux.cc:41 ... Operation not permitted`로 종료되어 assertion 단계까지 가지 못했습니다.
- `E2E_EXTERNAL_BASE_URL=http://127.0.0.1:3100 pnpm e2e:pw tests/e2e/data-sources-settings.spec.ts --workers=1`
  - [blocked] 외부 base URL 재사용으로 webServer 단계는 우회했지만, 브라우저 launch 단계에서 같은 권한 오류가 재현됐습니다.

## 남은 리스크와 엣지케이스
- read-only `최근 상태 확인`은 server snapshot 기준이고 `최근 연결 확인`은 브라우저 localStorage ping 기준이라 시점이 다를 수 있습니다. 두 블록의 의미 차이를 운영자가 혼동하지 않는지 후속 확인이 필요합니다.
- `pnpm build` full PASS 근거는 아직 확보하지 못했습니다. 타입체크는 통과했지만 build 명령 완주 재확인이 필요합니다.
- Playwright 실패는 현재 코드보다 실행 환경 제약에 가깝습니다. 포트 기동과 외부 base URL 재사용은 해결했지만 Chromium sandbox 권한이 막혀 E2E를 끝내지 못했습니다.

## 다음 작업자 인계사항
1. Chromium sandbox 제약이 없는 환경에서 `pnpm e2e:rc:data-sources`와 `pnpm e2e:rc`를 다시 실행해 최종 PASS 근거를 확보하세요.
2. 같은 환경에서 `pnpm build` 종료 코드까지 다시 확인해 full build PASS를 남기세요.
3. 운영 피드백에서 `최근 상태 확인`과 `최근 연결 확인` 문구 차이가 충분한지 확인하세요.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
