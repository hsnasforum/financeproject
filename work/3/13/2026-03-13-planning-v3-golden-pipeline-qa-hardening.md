# 2026-03-13 planning-v3 golden-pipeline qa-hardening

## 변경 파일
- 코드 수정 없음
- `work/3/13/2026-03-13-planning-v3-golden-pipeline-qa-hardening.md`

## 사용 skill
- `planning-gate-selector`: QA-only test 축에 맞춰 `vitest + eslint + diff check`만 실행하도록 검증 범위를 잠그는 데 사용
- `work-log-closeout`: audit 결과, source 확인 범위, 실행/미실행 검증을 `/work` 형식으로 남기는 데 사용

## 변경 이유
- 직전 `ops-migrate hardening` note가 다음 우선순위로 `planning/v3/qa/goldenPipeline.test.ts`를 별도 QA-only 축으로 열라고 남겼다.
- 현재 남은 tracked 변경 중 `tests/planning-v3/csv-parse.test.ts`, `tests/planning-v3/drafts-upload-flow.test.ts`는 `import/csv + legacy drafts + draft preview/save/list` 흐름을 다시 열 가능성이 크다.
- 반면 `planning/v3/qa/goldenPipeline.test.ts`는 digest / scenarios / alerts / impact golden baseline만 고정하는 단일 QA 파일이라, source를 넓게 열지 않고도 먼저 잠글 수 있었다.
- 현재 브랜치 `pr37-planning-v3-txn-overrides`는 이번 QA-only 축과 계속 어긋나므로, 이번 라운드도 golden baseline audit만 수행하고 csv/drafts/user-facing 범위로 번지지 않게 제한했다.

## 핵심 변경
- 이번 dirty는 product contract drift가 아니라 fixture/type alignment drift로 판단했다.
- `planning/v3/news/trend/contracts.ts`의 `TopicDailyStat`는 `burstGrade: High|Med|Low|Unknown`만 가지는 trend 통계 타입이고, `planning/v3/news/contracts.ts`의 `TopicDailyStat`는 digest 입력용으로 `baselineMean`, `baselineStddev`, `burstZ`와 한글 burst grade까지 허용한다.
- 현재 dirty diff는 `todayStats`를 그대로 digest에 넘기던 테스트 fixture를 `digestBurstTopics`로 변환해, trend output과 digest input 계약 경계를 맞추는 내용이다.
- 조건부로 source 파일 `planning/v3/news/contracts.ts`, `planning/v3/news/trend/contracts.ts`, `planning/v3/news/digest.ts`, `planning/v3/news/digest/buildDigest.ts`를 읽어 계약 경계만 확인했고, source 수정은 하지 않았다.
- `planning/v3/qa/goldenPipeline.test.ts` 현재 상태에서 golden snapshot test, deterministic test, noRecommendationText policy test는 모두 PASS했다.

## 검증
- 기준선 확인
  - `sed -n '1,240p' work/3/13/2026-03-13-planning-v3-ops-migrate-hardening.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-balances-read-wrapper-alignment.md`
  - `sed -n '1,220p' work/3/13/2026-03-13-planning-v3-store-helper-next-batch-breakdown.md`
- 상태 잠금
  - `git status --short -- planning/v3/qa/goldenPipeline.test.ts tests/planning-v3/csv-parse.test.ts tests/planning-v3/drafts-upload-flow.test.ts planning/v3/news/contracts.ts planning/v3/news/trend/contracts.ts planning/v3/news/digest.ts planning/v3/news/digest/buildDigest.ts planning/v3/news/scenario.ts planning/v3/alerts/evaluateAlerts.ts planning/v3/financeNews/impactModel.ts planning/v3/news/select/selectTop.ts`
- audit
  - `sed -n '1,260p' planning/v3/qa/goldenPipeline.test.ts`
  - `sed -n '261,520p' planning/v3/qa/goldenPipeline.test.ts`
  - `git diff -- planning/v3/qa/goldenPipeline.test.ts`
  - `rg -n "digest|scenario|alert|impact|selectTop|evaluateAlerts|impactModel|trend/contracts|news/contracts" planning/v3/qa/goldenPipeline.test.ts`
  - `sed -n '1,240p' planning/v3/news/contracts.ts`
  - `sed -n '1,240p' planning/v3/news/trend/contracts.ts`
  - `rg -n "burstTopics|TopicDailyStat" planning/v3/news/digest.ts planning/v3/news/digest/buildDigest.ts planning/v3/news/scenario.ts`
- 테스트
  - `pnpm exec vitest run planning/v3/qa/goldenPipeline.test.ts`
  - PASS
- lint
  - `pnpm exec eslint planning/v3/qa/goldenPipeline.test.ts`
  - PASS

## 미실행 검증
- source contract 변경이 없어서 추가 source 단위 테스트는 열지 않았다.
- `pnpm build`
- `pnpm e2e:rc`
- `pnpm release:verify`
- `pnpm planning:v2:complete`
- `pnpm planning:current-screens:guard`

## 남은 리스크
- 현재 goldenPipeline dirty는 fixture/type alignment로 설명되지만, 이후 digest input 타입이나 trend output 타입이 다시 바뀌면 같은 변환 구간이 다시 drift 지점이 될 수 있다.
- 이번 라운드는 source를 읽기만 했고 바꾸지 않았으므로, 실제 product contract drift가 새로 생기면 그때는 digest/scenario/alerts/impact 중 어느 축이 바뀌었는지 먼저 분리한 뒤 source를 최소 범위로 열어야 한다.
- `csv-parse`와 `drafts-upload-flow`는 여전히 더 넓은 user-facing 흐름으로 이어지므로 이번 QA-only 배치와 섞지 않았다.

## 다음 라운드 우선순위
1. `csv-parse`와 `drafts-upload-flow`는 그대로 열지 말고, 다음 라운드에서도 둘을 한 배치로 다루지 않을 수 있게 선행 분해부터 다시 한다.
2. `goldenPipeline`는 이번 note와 검증 결과 기준으로 재오픈하지 않는다.
3. wrapper/store/helper나 news/settings source는 새로운 계약 mismatch가 확인되기 전까지 다시 열지 않는다.
