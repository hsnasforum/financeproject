# Planning v2 User Guide

## 화면 경로
- `/planning`: 프로필 생성/편집, 실행 옵션 설정, 실행/실행 기록 저장
- `/planning/runs`: 실행 기록 목록/상세, 실행 기록 2개 비교, 단일 실행 기록 export
- `/planning/reports`: 최근 실행 기록 20개 리포트 허브(HTML 보기/다운로드, 메뉴 비노출)
- `/planning/trash`: profiles/runs/reports 휴지통 복구/영구삭제

## 멀티 프로필 범위
- 프로필/실행기록/액션 진행상태는 `vault/profiles/<profileId>/...`로 분리 저장됩니다.
- `/planning` 헤더의 프로필 선택값이 `/planning/runs`, `/planning/reports` 기본 스코프로 이어집니다.
- 가정 스냅샷(assumptions history/latest)은 전 프로필 공용으로 사용합니다.

## 대시보드의 현재 프로필과 최근 플랜

`/dashboard`의 현재 재무 상태는 저장된 기본 프로필 기준입니다. 그 아래 미래 결과는 같은 프로필의 완료 또는 부분 완료된 실행 중 가장 최근 계산 결과를 보여줍니다. 다른 프로필의 실행은 최근 플랜 목록에서 계속 열 수 있습니다.

저장된 프로필 조건이 계산 당시와 같으면 일치 안내를, 달라졌으면 재계산 안내를 표시합니다. 달라진 플랜의 `현재 프로필로 다시 계산`을 한 번 누르면 현재 기본 프로필에 이전 플랜의 기간·정책·기준 자료(snapshot)·가정·실행 설정을 적용해 새 실행을 저장하고 리포트를 엽니다. 시나리오가 있으면 저장된 시나리오 조건도 그대로 적용합니다. 대시보드 진입·새로고침·프로필 저장만으로 계산하거나 실행 기록을 저장하지 않습니다.

계산 중에는 버튼이 잠기며, 같은 요청을 재시도해도 기존 중복 방지 계약으로 하나의 실행만 저장합니다. 이전 실행과 액션 진행 기록은 유지되므로 실행 기록에서 이전·새 플랜을 비교할 수 있습니다. 이전 snapshot을 특정할 수 없거나 찾을 수 없는 경우, 또는 별도 저장 가정이 바뀌어 이전 조건을 재현할 수 없는 경우에는 새 실행을 저장하지 않습니다. 카드의 오류와 `계산 조건 검토`에서 현재 프로필이 선택된 `/planning`으로 이동해 확인해 주세요. 과거 형식이라 조건 일치를 확인할 수 없는 플랜은 기존 설정 화면 이동을 유지합니다.

재계산의 조건 동일성은 당시 자료와 계산 가정을 비교한 결과입니다. 해당 자료가 오늘 기준으로 최신이라는 뜻은 아닙니다.

현재 프로필의 저장 플랜이 없으면 없음으로 표시하고, 조건 비교 정보가 없는 과거 실행은 자동 확인 불가로 안내합니다. 조회·조건 확인에 실패했거나 완료된 계산 결과가 없으면 확인 실패 안내를 표시합니다. 이 비교는 저장된 프로필 조건에 한정하며, 가정 스냅샷의 최신성까지 확인한 의미는 아닙니다.

## 10분 온보딩 흐름
1. `/planning`에서 `New`로 프로필을 생성합니다.
2. 프로필(JSON 또는 폼)을 수정하고 `Save`를 눌러 저장합니다.
3. 스냅샷 선택:
   - `Snapshot ID` 비움: latest
   - `Snapshot ID` 입력: 해당 스냅샷으로 재현 실행
4. 실행 옵션 선택:
   - 기본: `simulate + scenarios + actions`
   - 필요 시 `monte-carlo`, `debt` 추가
5. `실행` 버튼으로 계산 후 Summary/Simulate/Scenarios/Monte Carlo/Actions/Debt 탭에서 결과 확인
6. `실행 기록 저장`으로 결과를 저장
7. `/planning/runs`에서 실행 기록 2개를 선택해 Compare, 필요 시 JSON export
8. 삭제한 항목을 되돌려야 하면 `/planning/trash`에서 Restore

## Allocation Policy 프리셋
- `Balanced` (기본): 기존 v2 우선순위 로직과 동일하게 동작합니다.
- `Safety-first`: 비상금/부채 상환을 더 보수적으로 우선합니다.
- `Growth-first`: 투자 기여를 우선하되, 적자/비상금 최소 보호 가드를 유지합니다.
- 선택값은 실행 기록 저장 시 함께 기록되어 비교/재현 시 사용됩니다.

목표 적립은 선택한 정책에서 사용할 수 있는 현금 안에서 계산합니다. 목표별 잔여 금액을 넘지 않는 최소 적립액을 먼저 배분하고, 예산이 부족하면 최소 필요액의 비율로 나눕니다. 남은 예산은 우선순위와 목표까지 남은 개월 수에 따라 배분하므로, 목표를 입력한 순서는 같은 목표의 적립액에 영향을 주지 않습니다. 이 추가 배분에서 목표액 상한에 걸려 남은 돈은 그달 현금으로 유지합니다. 이 계산은 새 실행에 적용되며, 과거에 저장한 실행 결과를 자동으로 다시 계산하지 않습니다.

목표의 최종 달성과 기한 내 달성은 구분합니다. 목표월을 넘긴 뒤 금액을 채웠다면 최종 달성 수에는 포함되지만, 목표 표에는 `기한 후 달성`으로 표시하고 기한 미달 경고를 남깁니다. 목표 표의 부족액은 시뮬레이션 마지막 시점 기준이므로 0원일 수 있습니다. 새 실행의 기한 미달 경고와 상세 근거에 담긴 부족액은 목표월 당시 금액을 기준으로 계산합니다. 아직 목표월이 오지 않았다면 기한 미달 경고를 만들지 않고 기존 진행률 기준으로 판단합니다.

## snapshotId 재현 실행
- 입력 위치: `/planning`의 `Snapshot ID`
- 결과 확인 위치: Summary 탭 `meta.snapshot.id/asOf/fetchedAt`
- 잘못된 snapshotId를 넣으면 API에서 `SNAPSHOT_NOT_FOUND` 에러를 반환합니다.

## Ack 게이트 (Health Critical)
- `meta.health.criticalCount > 0`이면 확인 체크박스(ack)가 표시됩니다.
- ack 전:
  - `실행`은 허용
  - `실행 기록 저장` 및 고비용/부가 액션(`Monte Carlo`, `Actions`) 제한
- ack 후:
  - 저장/고비용 실행 허용
- 권장 조치:
  - 수익률 가정(`investReturnPct`)을 낮추거나
  - `/ops/assumptions`에서 스냅샷 동기화 후 재실행

## 비교/내보내기
- `/planning/runs`:
  - Compare: `endNetWorth`, `worstCash`, `goals`, `warnings`, `health` 변화 비교
  - Export:
    - `Copy JSON`
    - `Download JSON` (`/api/planning/v2/runs/{id}/export`)
  - 사용자 기본 리포트:
    - `리포트 보기`로 HTML 리포트를 새 탭에서 확인합니다.
    - `다운로드(HTML)`로 파일 저장 후 보관/공유할 수 있습니다.
    - 브라우저 인쇄(`Ctrl/Cmd + P`)에서 `PDF로 저장`을 선택하면 PDF 파일로 변환됩니다.
    - 서버 PDF 다운로드(`/report.pdf`)는 옵션 기능이며 `PLANNING_PDF_ENABLED=true` + 한글 폰트/브라우저 런타임이 필요합니다.
  - Delete:
    - 기본 동작은 영구 삭제가 아니라 휴지통 이동(soft delete)
    - `/planning/trash`에서 복구 또는 영구 삭제 가능

## 리포트 보기/다운로드
- `/planning/runs`:
  - 각 실행 기록에서 `리포트 보기`로 HTML 리포트를 즉시 확인할 수 있습니다.
  - `다운로드(HTML)`로 같은 리포트를 바로 저장할 수 있습니다.
  - `공유 리포트 생성`은 마스킹(`light|standard|strict`)된 공유본을 별도로 생성/다운로드합니다.
- `/planning/reports`:
  - 별도 리포트 저장소가 아니라 실행 기록 기반 `리포트 허브`입니다.
  - 현재 선택 프로필 스코프에서 최근 실행 기록 20개를 기준으로 `리포트 보기`, `다운로드(HTML)`, `실행 기록 열기` 바로가기를 제공합니다.

## 자주 발생하는 오류
- `snapshot missing/stale`
  - 의미: 최신 스냅샷 없음/오래됨
  - 조치: `/ops/assumptions`에서 `Sync now`
- `BUDGET_EXCEEDED` (Monte Carlo)
  - 의미: `paths * horizonMonths` 예산 초과
  - 조치: paths 또는 horizonMonths를 줄여 재시도
- `SNAPSHOT_NOT_FOUND`
  - 의미: 입력한 snapshotId가 history에 없음
  - 조치: `/ops/assumptions/history`에서 ID 재확인

## 표준 에러 코드
- `INPUT`: 입력값 형식/범위 오류. 프로필 JSON, horizon, 옵션 값을 점검하세요.
- `SNAPSHOT_NOT_FOUND`: 지정한 `snapshotId`가 없습니다. history의 ID를 다시 확인하세요.
- `SNAPSHOT_MISSING`: 최신 스냅샷이 없어 기본 가정으로 계산했습니다. `/ops/assumptions`에서 동기화하세요.
- `BUDGET_EXCEEDED`: Monte Carlo 계산량이 큽니다. `paths` 또는 `horizonMonths`를 줄이세요.
- `LOCAL_ONLY`: 로컬 환경 정책 위반 요청입니다. localhost/127.0.0.1에서 실행하세요.
- `CSRF`: CSRF 검증 실패입니다. 페이지 새로고침 후 다시 시도하세요.
- `INTERNAL`: 서버 처리 오류입니다. 입력을 단순화해 재시도하고, 반복되면 OPS 로그를 확인하세요.

## 부분 실패 원칙
- `실행`은 `simulate`를 기준 결과로 유지합니다.
- 부가 단계(`scenarios`, `monte-carlo`, `actions`, `debt`) 중 일부가 실패해도 기본 결과는 화면에 유지됩니다.
- 실패 원인은 코드/메시지로 표시되며, 실패 단계만 다시 실행해도 됩니다.

## 사용자 고지
- Action/후보 표시는 비교/검토용이며 “특정 상품 구매 권유”가 아닙니다.
- 확률(몬테카를로) 결과는 모델 기반 추정이며 보장이 아닙니다.
