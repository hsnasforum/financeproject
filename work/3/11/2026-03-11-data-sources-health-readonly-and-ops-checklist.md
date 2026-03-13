# 2026-03-11 data-sources health readonly and ops checklist

## 내부 회의 결론
- `OpenDART`, `planning`은 ping 버튼이 없는 축이라 브라우저 localStorage 기반 `최근 연결 확인`으로는 최신 기준 시각을 보여줄 수 없습니다.
- 이 둘은 서버가 이미 알고 있는 최신 기준(`corpCodes generatedAt`, `planning snapshot asOf/fetchedAt`)을 사용자 도움 카드에 read-only로 붙이는 쪽이 가장 작은 안전한 수정입니다.
- `tests/e2e/data-sources-settings.spec.ts`는 `/settings/data-sources` 핵심 회귀를 잡지만 dev 전용 ping/health 의존이 있어 기본 `pnpm e2e:rc` 묶음보다 별도 `pnpm e2e:rc:data-sources`로 분리하는 편이 RC 목적에 맞다고 판단했습니다.
- 운영 가이드가 `docs/api-utilization-draft.md`와 DART 문서에 흩어져 있어 `/settings/data-sources` 전용 체크리스트를 `docs/data-sources-ops.md`로 분리했습니다.

## 수정 대상 파일
- `src/app/settings/data-sources/page.tsx`
- `src/components/DataSourceImpactCardsClient.tsx`
- `src/app/api/dev/data-sources/health/route.ts`
- `src/lib/dataSources/impactHealth.ts`
- `tests/data-source-impact-health.test.ts`
- `tests/e2e/data-sources-settings.spec.ts`
- `package.json`
- `README.md`
- `docs/README.md`
- `docs/api-utilization-draft.md`
- `docs/data-sources-ops.md`

## 무엇이 바뀌었는지
1. `OpenDART`, `planning` 도움 카드에 read-only `운영 최신 기준` 블록을 추가했습니다.
2. dev health API가 `planning` 최신 스냅샷과 `OpenDART` 인덱스 최신 시각을 함께 반환하도록 보강했습니다.
3. `data-sources-settings.spec.ts`는 유지하되 기본 `e2e:rc`에는 넣지 않고 `e2e:rc:data-sources` 별도 스크립트로 분리했습니다.
4. `/settings/data-sources` 운영 체크리스트를 `docs/data-sources-ops.md`로 분리하고 README/docs index에 연결했습니다.

## 검증
- `pnpm test tests/data-source-impact-health.test.ts tests/data-source-impact-ping.test.ts tests/data-source-user-impact.test.ts`
  - PASS (`3 files / 11 tests`)
- `pnpm lint`
  - PASS
- `pnpm exec tsc --noEmit`
  - PASS
- `pnpm build`
  - [검증 필요] webpack compile 단계까지는 성공 메시지를 확인했지만, 현재 CLI 세션에서는 종료 코드를 안정적으로 회수하지 못했습니다.
- `pnpm e2e:pw tests/e2e/data-sources-settings.spec.ts --workers=1`
  - [blocked] 현재 환경에서 Playwright webServer 기동 시 `connect EPERM 127.0.0.1:3126`로 시작 단계가 막혔습니다.

## 남은 리스크와 엣지케이스
- `pnpm build` 완주 결과는 현재 세션에서 미확정입니다. `tsc --noEmit`는 통과했고 webpack compile도 성공 메시지를 확인했지만, full build PASS는 재확인이 필요합니다.
- `/settings/data-sources` e2e는 현재 환경의 로컬 포트 바인드 제약 때문에 재실행 근거를 남기지 못했습니다.
- read-only `운영 최신 기준`은 server snapshot 기준이라, 브라우저 localStorage 기반 `최근 연결 확인`과 시점이 다를 수 있습니다. 문구로 구분했지만 운영자가 두 블록의 의미를 혼동하지 않는지 후속 확인이 필요합니다.

## 이번 라운드 완료 항목
- ping 없는 카드의 read-only 최신 기준 표시
- settings 전용 e2e 스크립트 분리
- `/settings/data-sources` 운영 체크리스트 분리

## 다음 라운드 우선순위
1. 포트 바인드 제약이 없는 환경에서 `pnpm build`와 `pnpm e2e:rc:data-sources`를 다시 실행해 최종 PASS 근거를 확보
2. 필요하면 `DataSourceHealthTable` 본문에도 `latestMeta`를 노출할지 검토
3. `read-only 운영 최신 기준`과 `최근 연결 확인`의 문구 대비가 충분한지 운영 피드백 확인

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
