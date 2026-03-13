# 2026-03-11 parallel report flake script

## 변경 이유
- `/planning/reports` 초기 fan-out를 줄인 뒤에는 전체 병렬 suite보다 reports 진입 축만 좁게 다시 볼 수 있는 스크립트가 필요했다.
- 기존 `e2e:parallel:flake` 는 3개 흐름으로 충분히 작았지만, reports 대시보드 계약 자체를 한 번 더 눌러 보는 카드가 없었다.

## 이번 변경
1. `package.json` 에 `pnpm e2e:parallel:report-flake` 를 추가했다.
2. 새 스크립트는 `flow-planner-to-history`, `flow-history-to-report`, `dart-flow` 에 더해 `planning-v2-fast` 의 `/planning/reports` 계약 1건만 `--grep` 으로 포함한다.
3. `README.md`, `docs/README.md` 에 새 병렬 reports 재현 스크립트를 운영 명령으로 남겼다.
4. 멀티 에이전트 작업리스트에서 Task 3를 완료로 올리고 다음 우선순위를 Task 4로 갱신했다.

## 검증
1. `pnpm build`
2. `pnpm lint`
3. `pnpm e2e:rc`
4. `pnpm e2e:parallel:report-flake`

## 남은 리스크
- shared `next dev --webpack` 자체가 병렬 런타임 오류를 만들 수 있어, 새 스크립트는 재현을 좁히는 용도이지 근본 해결은 아니다.
- 다음 단계는 `next start` 또는 prebuilt 모드 기반 병렬 실행 경로를 분리해 dev runtime 영향과 앱 회귀를 분리해서 보는 것이다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.
