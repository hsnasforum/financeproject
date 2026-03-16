# 2026-03-16 P1-1 narrow closeout audit

## 이번 배치 대상 항목 ID
- `P1-1`

## 변경 파일
- `work/3/16/2026-03-16-p1-1-narrow-closeout-audit.md`

## 핵심 변경
- `P1-1` 후속으로 분리했던 좁은 e2e/spec 6개를 개별 재실행해 residual failure 유무를 다시 확인했다.
- `flow-planner-to-history`, `planning-quickstart-preview`, `smoke`, `data-sources-settings`, `news-settings-alert-rules`, `dart-flow`가 모두 통과했다.
- 이번 라운드에서는 residual failure가 재현되지 않아 코드 수정은 하지 않았다.
- 따라서 현재 `P1-1` 잔여 이슈는 좁은 selector/copy drift 묶음이 아니라, 아직 재검증하지 않은 broader RC 범위 또는 후속 운영 판단 쪽으로 좁혀진다.

## 검증
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/flow-planner-to-history.spec.ts --workers=1`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/planning-quickstart-preview.spec.ts --workers=1`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/smoke.spec.ts --workers=1`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/data-sources-settings.spec.ts --workers=1`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/news-settings-alert-rules.spec.ts --workers=1`
- `node scripts/playwright_with_webserver_debug.mjs test tests/e2e/dart-flow.spec.ts --workers=1`
- `git diff --check -- work/3/16/2026-03-16-p1-1-narrow-closeout-audit.md`

## 남은 리스크
- `P1-1`은 아직 `[진행중]`이다. 이번 라운드는 narrow spec audit만 다시 수행했을 뿐, full `pnpm e2e:rc`를 재실행하지 않았다.
- `.data/*` 로컬 변경과 stale hold note 4개는 이번 범위에서 그대로 남겨뒀다.
- 좁은 묶음은 모두 통과했지만, broader RC에서 다른 표면이 다시 흔들리는지 여부는 아직 확인하지 않았다.

## 다음 우선순위
- `P1-1` closeout 기준을 narrow spec pass 기준으로 볼지, full RC 기준으로 다시 확인할지 운영 판단 정리
- full RC를 아직 열지 않는다면, 현재 결과를 근거로 `P1-1` 남은 리스크를 문서상에서 더 구체적으로 좁혀 기록

## 사용한 skill
- `planning-gate-selector`: broad RC 대신 좁은 e2e 6개를 개별 실행해 residual failure 범위를 다시 분류하는 데 사용.
- `work-log-closeout`: 이번 audit 결과, 실행한 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용.
