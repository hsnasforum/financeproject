# 2026-03-11 e2e:rc 직렬 안정화

## 수정 대상 파일
- `src/components/DartSearchClient.tsx`
- `package.json`
- `README.md`
- `docs/README.md`

## 변경 이유
- 병렬 `next dev` 환경에서 `dart-flow` 검색 버튼 클릭이 hydration 이전 native submit으로 처리되며 `/public/dart` 재로드가 발생했습니다.
- 같은 RC 묶음에서 `/planning/reports` 진입은 앱 고유 로직보다 공유 dev 서버/webpack 런타임 불안정으로 `net::ERR_ABORTED`가 재현됐습니다.
- RC 검증 명령은 결정적으로 PASS/FAIL을 반환해야 해서 `pnpm e2e:rc`를 직렬 실행으로 고정했습니다.

## 실행한 검증 명령
- `pnpm e2e:pw tests/e2e/smoke.spec.ts tests/e2e/flow-planner-to-history.spec.ts tests/e2e/flow-history-to-report.spec.ts tests/e2e/dart-flow.spec.ts --workers=2 --reporter=line`
- `pnpm e2e:rc`

## 무엇이 바뀌었는지
1. DART 검색 버튼을 hydration 완료 전에는 비활성화하고, hydration 전 click이 native submit으로 새로고침되지 않도록 막았습니다.
2. Enter 키 검색도 hydration 이후에만 동작하도록 동일한 가드를 맞췄습니다.
3. `pnpm e2e:rc`는 `--workers=1`을 포함하도록 바꿔 RC 핵심 셋을 직렬 실행으로 고정했습니다.
4. README와 docs index에 직렬 실행 의도를 함께 문서화했습니다.

## 재현 또는 검증 방법
1. 병렬 flake 재현: `pnpm e2e:pw tests/e2e/smoke.spec.ts tests/e2e/flow-planner-to-history.spec.ts tests/e2e/flow-history-to-report.spec.ts tests/e2e/dart-flow.spec.ts --workers=2`
2. RC 게이트 확인: `pnpm e2e:rc`

## 남은 리스크와 엣지케이스
- `pnpm e2e:pw` 또는 다른 병렬 Playwright 묶음은 여전히 공유 `next dev` 서버/webpack 불안정 영향을 받을 수 있습니다.
- 이번 수정은 RC 핵심 셋의 결정성을 우선한 조치이며, 병렬 dev 런타임 자체를 근본 해결한 것은 아닙니다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
