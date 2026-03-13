# 2026-03-10 recommend planning linkage readiness

### 변경 파일

- `src/app/api/recommend/route.ts`
- `tests/recommend-api.test.ts`
- `docs/planning-ui-calculation-removal-candidates.md`
- `docs/planning-engine-week-realignment.md`

### 변경 이유

- recommend API는 이미 `planningContext`를 받을 수 있었지만, canonical planning stage/status/trace와 연결된 상태는 아니었다.
- 이 상태에서 planning 연동이 끝난 것처럼 읽히지 않도록, readiness만 노출하는 `planningLinkage` 메타를 계약으로 고정했다.

### 핵심 변경

- `/api/recommend` 응답 `meta`에 `planningLinkage`를 추가해 `none | partial | ready` readiness와 `metricsCount`, `stageInference: "disabled"`를 함께 반환한다.
- readiness는 `monthlyIncomeKrw`, `monthlyExpenseKrw`, `liquidAssetsKrw`, `debtBalanceKrw` 4개 입력 충족도만 계산한다.
- 점수 계산, 추천 reason, stage/status/trace 추정 로직은 추가하지 않았다.
- `tests/recommend-api.test.ts`에서 partial, none, ready 케이스를 API 계약으로 고정했다.
- 관련 문서 2곳에 “recommend는 readiness만 노출하고 stage 추정은 하지 않는다”는 현재 경계를 반영했다.

### 검증

- `pnpm test tests/recommend-api.test.ts`
- `pnpm exec eslint tests/recommend-api.test.ts src/app/api/recommend/route.ts`

### 남은 리스크

- `planningLinkage`는 준비 상태 표시일 뿐이며, canonical `runId`나 planning `Stage`를 연결하지 않는다.
- recommend 결과의 scoring/reason은 여전히 planning engine/result와 분리돼 있다.
- 전체 `pnpm build`, 전체 `pnpm test`, `pnpm planning:v2:compat`, `pnpm e2e:rc`는 아직 미실행이다.

## 다음 작업
- 이 메모는 `/work` 구조 정렬 배치에서 `다음 작업` 섹션만 보강했습니다.
- 실제 후속 우선순위는 더 최신 closeout 기준으로 다시 판단합니다.

## 변경 파일
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 변경 파일 상세는 기존 본문 기준으로 확인합니다.

## 사용 skill
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 사용 skill 상세는 기존 본문 기준으로 확인합니다.

## 검증
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 당시 실행 검증 상세는 기존 본문 기준으로 확인합니다.

## 남은 리스크
- [미확인] `/work` 구조 정렬 배치에서 필수 섹션만 보강했습니다. 실제 잔여 리스크는 더 최신 closeout 기준으로 다시 판단합니다.
