# 2026-03-12 전역 스캔 1차: build trace 경고 정리

## 변경 파일
- `src/lib/ops/metrics/metricsStore.ts`
- `tests/planning/ops/metricsStore.test.ts`
- `work/3/12/2026-03-12-global-scan-build-trace-warning.md`

## 사용 skill
- `planning-gate-selector`
  - 전역 스캔 중 잡힌 문제를 `ops 로그 helper` + `build 영향`으로 분류하고 `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm planning:current-screens:guard`, `pnpm build`, `pnpm multi-agent:guard`까지 넓히는 근거로 사용했다.
- `work-log-closeout`
  - 이번 스캔 라운드의 실제 확인 결과, 실제 수정, 남은 리스크를 `/work` 형식으로 정리하는 데 사용했다.

## 변경 이유
- 프로젝트 전체 보수 스캔 1차에서 전역 게이트를 돌린 결과 `typecheck`, `lint`, `multi-agent:guard`, `planning:current-screens:guard`는 통과했다.
- 다만 첫 `pnpm build`에서 standalone trace 복사 단계에 `ENOENT` 경고가 1건 발생했다.
- 경고 대상은 존재하지 않는 rotated metrics 파일 `.data/planning/ops/metrics/metrics.1.ndjson`이었고, `src/lib/ops/metrics/metricsStore.ts`가 실제 존재 여부와 무관하게 후보 경로를 직접 열거하는 방식이 원인이었다.

## 핵심 변경
- `metricsStore.readRecent`가 rotation count 기반으로 가상의 후보 파일명을 직접 만들지 않고, 실제 metrics 디렉터리에 존재하는 current/rotated 파일만 읽도록 바꿨다.
- 이렇게 바꿔 standalone trace가 존재하지 않는 `metrics.1.ndjson`를 복사하려다 경고를 내는 경로를 제거했다.
- `tests/planning/ops/metricsStore.test.ts`에 현재 파일과 띄엄띄엄 존재하는 rotated 파일(`metrics.2.ndjson`)만 있어도 `readRecent`가 정상 동작하는 회귀 테스트를 추가했다.
- 전역 스캔 결과로는 현재 열린 대규모 워크트리에서도 `pnpm lint`, `pnpm typecheck`, `pnpm planning:current-screens:guard`, `pnpm build`, `pnpm multi-agent:guard`가 모두 통과하는 상태를 확인했다.

## 검증
- `pnpm multi-agent:guard`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm planning:current-screens:guard`
- `pnpm test tests/planning/ops/metricsStore.test.ts`
- `pnpm build`
- `git diff --check -- src/lib/ops/metrics/metricsStore.ts tests/planning/ops/metricsStore.test.ts`

## 남은 리스크
- 현재 워크트리는 `planning v2/v3`, `DART`, `data-sources`, `docs`, `scripts`가 동시에 크게 열려 있어, 다음 보수 라운드는 여전히 작은 batch 단위로 잘라야 안전하다.
- 이번 수정은 observed build warning 1건을 닫은 것이다. `metricsLog`, `securityAuditLog`, 다른 rotation helper에도 같은 패턴이 있는지는 별도 배치로 재점검할 가치가 있다.
- build는 성공했지만, 전역 `pnpm test`와 `pnpm release:verify`는 아직 이번 라운드에서 실행하지 않았다.

## 다음 작업자 인계사항
- 다음 보수 batch 후보 1순위는 `rotation helper 패턴 공통화 또는 다른 ops 로그 store의 동일 경고 가능성 점검`이다.
- 그다음 후보는 `git status`상 크게 열려 있는 도메인을 `planning/report`, `DART/data-sources`, `ops/docs`, `multi-agent`로 더 잘게 자르는 것이다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
