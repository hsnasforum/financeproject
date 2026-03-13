# 2026-03-12 DART data-sources batch 검증 closeout

## 변경 파일
- 코드/문서 추가 수정 없음
- `work/3/12/2026-03-12-dart-data-sources-batch-verification-closeout.md`

## 사용 skill
- `dart-data-source-hardening`: DART/data-sources 범위에서 env 누락, query 입력, read-only 최신 기준, mock/replay 해석이 실제 동작과 맞는지 점검하는 기준으로 사용했다.
- `planning-gate-selector`: DART/data-sources 범위의 최소 검증 세트를 `unit/API + 좁은 e2e + build`로 고정하는 데 사용했다.
- `work-log-closeout`: 이번 라운드의 실제 검증 결과와 남은 우선순위를 `/work` 형식으로 정리하는 기준으로 사용했다.

## 변경 이유
- 최신 `/work` 기준 다음 우선순위 1순위는 `DART/data-sources` 축을 별도 batch로 분리해 blocker와 follow-up을 다시 고정하는 일이었다.
- manager 분해 결과, 이번 배치에서 먼저 확인할 최소 리스크는 `/settings/data-sources`의 `read-only/meta drift`와 DART 경로의 `env/query/fallback drift` 두 갈래로 고정됐다.
- 관련 dirty 파일이 넓게 열려 있었지만, 실제 blocker인지 아니면 이미 검증 가능한 상태인지 다시 확인이 필요했다.

## 핵심 변경
- data-sources impact/read-only/helper 경로와 DART query/store/route 경로에 대해 관련 unit 테스트를 묶어 다시 실행했고 모두 PASS를 확인했다.
- 사용자 경로는 `pnpm e2e:rc:dart`와 `pnpm e2e:rc:data-sources`를 단독 실행해 `/public/dart` 검색/회사/모니터링 흐름과 `/settings/data-sources` read-only/ping 흐름을 각각 PASS로 확인했다.
- `pnpm build`를 단독 실행해 현재 dirty DART/data-sources 변경이 Next build blocker를 다시 열지 않았음을 확인했다.
- 따라서 이번 라운드에서는 DART/data-sources 코드 추가 수정 없이, 현재 남은 blocker가 없음을 확정했다.

## 검증
- `pnpm test tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts tests/data-source-ping-state.test.ts tests/data-sources-status.test.ts tests/dart-store.test.ts tests/dart-disclosure-store.test.ts tests/dart-base-url-env.test.ts tests/dart-company-route.test.ts tests/dart-disclosure-monitor-helpers.test.ts tests/dart-query-helpers.test.ts tests/dart-search-client.test.tsx`
  - PASS
- `pnpm e2e:rc:dart`
  - PASS (`3 passed`)
- `pnpm e2e:rc:data-sources`
  - PASS (`1 passed`)
- `pnpm build`
  - PASS

## 미실행 검증
- `pnpm planning:v2:prod:smoke`
  - 미실행. 이번 라운드는 prod smoke/helper 코드를 새로 수정하지 않았고, DART/data-sources 사용자 경로와 build 재검증에 집중했다.
- `pnpm e2e:rc`
  - 미실행. 이번 라운드는 DART/data-sources 경로만 좁게 다시 확인했다.

## 남은 리스크
- 이번 라운드 범위의 `DART/data-sources` blocker는 현재 기준으로 없다.
- DART `generatedAt`과 실제 신규 공시 접수 시각이 다른 의미라는 점, mock/replay 200이 live 성공과 다르다는 해석 규칙은 계속 유지해야 한다.
- 저장소 전체 dirty worktree는 여전히 크므로, 다음 라운드도 기능축별 작은 batch와 single-owner 최종 게이트 원칙을 유지하는 편이 안전하다.

## 이번 라운드 완료 항목
1. DART query/store/route/unit 경로 재검증
2. `/public/dart` 사용자 흐름 e2e PASS 확인
3. `/settings/data-sources` read-only/ping 흐름 e2e PASS 확인
4. `DART/data-sources` 범위의 build blocker 부재 확정

## 다음 라운드 우선순위
1. `ops/docs` 축은 기능 수정과 섞지 않고 문서/운영 규칙만 다루는 라운드로 분리
2. 큰 dirty worktree 최종 게이트는 build/e2e single-owner 원칙으로 계속 유지
3. DART/data-sources의 추가 기능 확장은 blocker 정리와 분리된 별도 기능 배치로 다루기
