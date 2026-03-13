# 2026-03-12 planning-v3 internal route contract closeout

## 변경 파일
- `tests/planning-v3-write-route-guards.test.ts`
- `tests/planning-v3-internal-route-contract.test.ts`

## 사용 skill
- `planning-gate-selector`: 이번 라운드를 `planning-v3 internal-only route 계약` 테스트 배치로 좁히고, 관련 `vitest + eslint`만 실행하도록 검증 범위를 고르는 데 사용
- `work-log-closeout`: 실제 caller inventory 결론, 추가한 회귀 테스트, 실행한 검증을 `/work` 형식으로 정리하는 데 사용

## 변경 이유
- 최신 최종 게이트 closeout 이후 `planning-v3`에서 남아 있던 최소 실제 리스크는 local-only/dev-only가 남은 3개 route가 정말 user-facing caller가 없는 내부 전용 경로인지 명시적 회귀 근거가 약하다는 점이었습니다.
- 대상 route는 `transactions/overrides`, `transactions/batches/merge`, `transactions/batches/[id]/transfers`였습니다.
- caller가 없는데 guard를 완화하는 것은 불필요한 surface 확장이므로, 이번 라운드는 구현 변경이 아니라 `internal-only 계약을 테스트로 고정`하는 쪽으로 닫았습니다.

## 핵심 변경
- `tests/planning-v3-write-route-guards.test.ts`에 non-user-facing write route 3개 중 write 경로 2종을 runtime target으로 추가했습니다.
  - `transactions/overrides` `PATCH`, `DELETE`
  - `transactions/batches/merge` `POST`
  - same-origin remote host에서도 `LOCAL_ONLY`를 유지하는지 런타임으로 고정
- `tests/planning-v3-internal-route-contract.test.ts`를 추가했습니다.
  - `transactions/overrides` `GET`, `transactions/batches/[id]/transfers` `GET`가 same-origin remote host에서 `LOCAL_ONLY`를 반환하는지 확인
  - `src/app`, `src/components`, `src/lib`에서 위 3개 internal-only route를 직접 참조하는 user-facing source가 없는지 정적 스캔으로 확인
- 코드/route/docs는 수정하지 않았습니다. 이번 라운드 결론은 `이 3개 route는 현재도 internal-only 유지가 맞다`입니다.

## 검증
- `pnpm test tests/planning-v3-write-route-guards.test.ts tests/planning-v3-internal-route-contract.test.ts tests/planning-v3-overrides-api.test.ts tests/planning-v3-batches-merge-api.test.ts tests/planning-v3-transfers-api.test.ts`
  - PASS
- `pnpm exec eslint tests/planning-v3-write-route-guards.test.ts tests/planning-v3-internal-route-contract.test.ts`
  - PASS
- `git diff --check -- tests/planning-v3-write-route-guards.test.ts tests/planning-v3-internal-route-contract.test.ts`
  - PASS

## 남은 리스크
- 이번 라운드 범위의 `planning-v3 internal-only route` blocker는 없습니다.
- 향후 UI가 `transactions/overrides`, `transactions/batches/merge`, `transactions/batches/[id]/transfers`를 직접 호출하게 되면, 그 시점에만 route 하나씩 분리해서 `same-origin + CSRF` 계약으로 재검토하면 됩니다.
- 현재 실제 남은 큰 축은 internal route guard가 아니라 `planning-v3`와 `other` dirty bucket의 기능축 분리입니다. 다음 라운드는 큰 변경을 다시 잘게 자르는 작업이 우선입니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.
