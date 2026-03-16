# 07. Planning run / Recommend history / Report linkage 결정

작성 기준: 저장소 코드 정적 분석, 2026-03-16(KST)
범위: `P2-5 history/report 통합`

---

## 1. 목적

이 문서는 planning run, recommend local history, planning report/export 사이의 연결 기준을
코드 구현 전에 먼저 고정하기 위한 결정 문서입니다.

이번 라운드의 목표는 아래 4가지입니다.

1. recommend local run id와 planning run id의 owner를 분리한다.
2. history → planning report의 canonical link 규칙을 정한다.
3. planning report/export → recommend reverse link 범위를 어디까지 열지 정한다.
4. `P2-5`의 first path와 후속 순서를 작게 고정한다.

---

## 2. 현재 코드 기준 자산

## 2.1 Recommend history

현재 recommend local history의 owner는 `SavedRecommendRun`입니다.

확인된 사실:
- top-level `SavedRecommendRun.runId`는 local history id입니다.
- 저장 프로필 안에는 optional `planning?: RecommendPlanningHandoff`가 있고, 여기의 `planning.runId`는 planning run ref입니다.
- `SavedRunProfile.planning.runId`가 있으면 recommend 실행이 어느 planning run에서 열렸는지 저장할 수 있습니다.

주의:
- 현재 `RecommendHistoryClient`의 `리포트 →` 링크는 `run.runId`를 `/planning/reports?runId=...`에 그대로 넣고 있습니다.
- 이 값은 recommend local history id라서 planning report query에 쓰면 owner가 섞입니다.

## 2.2 Planning report / export

공식 planning report owner는 `PlanningRunRecord`입니다.

확인된 사실:
- `/planning/reports`는 `runId` query를 받아 공식 report scope를 엽니다.
- `ReportInputContract.runId`는 `PlanningRunRecord.id`를 그대로 소유합니다.
- standalone HTML export도 `run.id`를 기준으로 file name, header, reproducibility를 구성합니다.
- report/export는 이미 `assumptionsLines`, `snapshot`, `reproducibility`, interpretation evidence 요약을 소유합니다.

## 2.3 Legacy report builder

`src/lib/report/reportBuilder.ts`는 deprecated이고 legacy `/report` 전용입니다.

결론:
- planning/report linkage의 source-of-truth는 `/planning/reports`와 `src/lib/planning/reports/*`입니다.
- legacy builder의 `savedRun.runId` 사용 패턴은 이번 결정의 기준으로 삼지 않습니다.

---

## 3. 핵심 위험

### 3.1 `runId` 혼동 위험

현재 저장소에는 성격이 다른 두 `runId`가 공존합니다.

- recommend local history id: `SavedRecommendRun.runId`
- planning canonical run id: `PlanningRunRecord.id` = `profile.planning.runId`

이 둘을 같은 query field나 같은 UI 라벨에 섞으면 아래 문제가 생깁니다.

- history에서 report로 이동할 때 잘못된 `runId`를 넘길 수 있음
- reverse link를 붙일 때 latest-match 같은 취약한 추론이 들어갈 수 있음
- export에 어떤 실행을 source로 썼는지 재현성이 흐려짐

### 3.2 reverse link 과잉 확장 위험

planning report/export 쪽에서 recommend history를 역참조하려면
recommend local history id가 planning 쪽에도 명시적으로 남아야 합니다.

현재는 그 ref가 없습니다.

따라서 아래 방식은 금지하는 편이 안전합니다.

- 같은 시각대 실행을 latest-match로 붙이기
- planning run id 하나만으로 여러 recommend history 중 임의 하나를 역선택하기
- export에서 raw recommend payload를 같이 복제하기

---

## 4. linkage contract 결정

## 4.1 ID ownership 분리 원칙

`[권장안]`

- recommend local history owner id는 `SavedRecommendRun.runId`로 유지합니다.
- planning canonical owner id는 `PlanningRunRecord.id`로 유지합니다.
- recommend history 안의 planning ref는 새 top-level field를 만들지 않고, 이미 존재하는 `SavedRunProfile.planning.runId`를 canonical stored field로 사용합니다.

정리:

| 역할 | canonical field | owner |
| --- | --- | --- |
| recommend local history id | `SavedRecommendRun.runId` | recommend local history |
| planning canonical run id | `PlanningRunRecord.id` | planning run |
| recommend history 안의 planning ref | `SavedRunProfile.planning.runId` | saved recommend profile |

메모:
- 이번 first path에는 새 schema migration이 필요하지 않습니다.
- 향후 planning 쪽에서 recommend reverse ref를 저장해야 할 때만 별도 ref field를 논의합니다.

## 4.2 History → Planning report link 규칙

`[권장안]`

- recommend history에서 planning report로 이동할 때는 `SavedRunProfile.planning.runId`만 사용합니다.
- `planning.runId`가 없으면 링크를 숨기거나 비활성화하고, local history id로 fallback하지 않습니다.
- canonical href는 `/planning/reports?runId=<planningRunId>`입니다.

이유:
- 공식 report route가 이미 `runId` query를 받습니다.
- planning run ref가 저장된 recommend history row가 이미 존재합니다.
- local recommend id를 report route에 넘기는 실수를 막을 수 있습니다.

## 4.3 Planning report / export → Recommend reverse link 규칙

`[권장안]`

- reverse link는 concrete recommend history id가 planning/report 쪽에 명시적으로 남는 시점 전까지 자동 노출하지 않습니다.
- planning report/export는 “지금 이 report에서 파생된 recommend가 있었다”는 사실을 heuristic으로 추정하지 않습니다.
- 향후 reverse link를 열 때 owner id는 recommend local history id인 `SavedRecommendRun.runId`를 써야 합니다.

메모:
- 필드명은 후속 구현 시 `[권장안] recommendRunId`처럼 명시적으로 두는 편이 읽기 쉽습니다.
- 다만 이번 라운드에서는 reverse ref 저장 자체를 열지 않으므로 문서 제안까지만 남깁니다.

## 4.4 freshness / assumptions / trace 노출 범위

`[권장안]`

`P2-5`에서 history/report/export가 보여줄 연결 정보는 요약/출처/기준 수준으로 제한합니다.

지금 바로 owner로 인정할 수 있는 범위:
- freshness: `snapshot.id`, `snapshot.asOf`, `snapshot.fetchedAt`, `snapshot.staleDays`
- assumptions: `assumptionsLines`, `reproducibility.assumptionsSnapshotId`, `assumptionsHash`, `effectiveAssumptionsHash`
- trace: report interpretation evidence 요약 + `reproducibility` 요약

이번 라운드에서 보류하는 범위:
- raw engine trace 전체 복제
- recommend history에 planning trace blob 저장
- export에 full trace JSON 부착

결론:
- trust/freshness/assumptions owner는 planning report/export 쪽
- recommend history는 이 요약을 직접 복제하기보다 planning report 링크로 안내하는 편이 더 안전합니다.

---

## 5. 권장 first path

### 5.1 first path

`[권장안]` recommend history 상세에서 planning report로 돌아가는 링크를 먼저 엽니다.

구체 규칙:
- source: `activeRun.profile.planning?.runId`
- target: `/planning/reports?runId=<planningRunId>`
- guard: `planning.runId`가 없으면 링크를 숨김

### 5.2 왜 가장 작은가

- 새 route가 필요 없습니다.
- 새 API contract가 필요 없습니다.
- 새 schema migration이 필요 없습니다.
- 이미 저장되는 `planning.runId`를 바로 쓸 수 있습니다.
- official report path만 소비하므로 legacy builder와 섞이지 않습니다.

---

## 6. `P2-5` 구현 순서

### 6.1 Step 1

recommend history 상세에서 `profile.planning.runId` 기반 report 링크를 여는 first path 구현

### 6.2 Step 2

recommend history row와 planning report 사이의 reverse ref를 explicit owner 기준으로 추가할지 결정

- 후보 owner: planning 쪽의 explicit `recommendRunId`
- 금지: latest recommend heuristic

### 6.3 Step 3

planning report/export에 source freshness / assumptions / trace 요약을 linkage 메모 수준으로만 추가

- raw trace 복제는 제외
- link summary / 기준일 / snapshot source 수준으로 제한

---

## 7. 이번 라운드 결론

- recommend local history id와 planning run id는 분리 유지합니다.
- stored planning ref는 이미 존재하는 `SavedRunProfile.planning.runId`를 canonical field로 사용합니다.
- first path는 recommend history 상세 → planning report 링크가 가장 작고 안전합니다.
- reverse link와 export linkage는 summary/ref 수준까지만 열고, explicit recommend history ref가 생기기 전까지 자동 연결하지 않습니다.
