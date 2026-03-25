# 2026-03-19 N5 recommend history raw identifier exposure polish

## 변경 파일

- `src/components/RecommendHistoryClient.tsx`
- `work/3/19/2026-03-19-n5-recommend-history-identifier-polish.md`

## 사용 skill

- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 미실행 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용

## 변경 이유

- `/recommend/history` 목록과 상세 영역에서 `runId`, `planningRunId`가 저장 시점이나 목적/조건보다 먼저 눈에 띄어 기본 화면의 핵심 정보처럼 읽히는 구간이 남아 있었다.
- 이번 배치는 `N5 recommend/history surface`의 copy/helper/disclosure polish만 다뤄야 했고, 저장 구조나 planning 연계 계약은 그대로 유지해야 했다.
- 사용자가 먼저 읽어야 하는 정보를 `언제 저장했는지`, `무슨 목적/조건으로 저장했는지`, `다음에 무엇을 할 수 있는지` 순서로 다시 세울 필요가 있었다.

## 핵심 변경

- 실행 목록 카드에서 상단 요약을 `저장 시점 -> 저장 조건 -> 다음에 할 일` 순서로 재배치하고, 목적/상품 유형/기간/유동성/금리 정책/예금자 보호 조건을 사람이 읽기 쉬운 문장으로 정리했다.
- planning 연계 CTA는 유지하되, raw ID 대신 `저장 당시 플래닝 보기`처럼 저장 근거를 먼저 읽게 하는 설명이 앞에 오도록 문구와 위치를 다듬었다.
- 상세 영역에서도 `저장 시점`, `저장 조건`, `다음에 할 일`을 먼저 보여 주고, 비교 담기/플래닝 근거 CTA 뒤에 보조 식별자 레이어를 두도록 위계를 조정했다.
- `RunIdentifierDisclosure`의 summary/body 문구를 `공유·복구용 보조 정보` 톤으로 바꾸고, 직접 공유·복구·지원 대응이 필요할 때만 여는 정보라는 성격을 더 분명히 했다.

## 검증

- `git diff --check -- src/components/RecommendHistoryClient.tsx src/app/recommend/page.tsx work/3/19/2026-03-19-n5-recommend-history-identifier-polish.md`
- `pnpm lint`
  - 통과
  - 기존 unrelated warning 30건은 그대로 남아 있음
- `pnpm build`
  - 통과
- 미실행 검증
  - `pnpm e2e:rc` (`compare/list/detail` 상호작용 구조를 바꾸지 않고 copy/helper/disclosure 위계만 조정해 이번 라운드에서는 미실행)

## 남은 리스크

- 이번 라운드는 copy/helper/disclosure polish만 수행했기 때문에, 실제 사용자가 보조 식별자를 덜 핵심 정보로 인식하는지는 별도 사용성 확인이 더 필요하다.
- 추천 기록 카드에 조건 요약을 더 읽기 쉽게 풀어 썼지만, 문구 길이가 작은 화면에서 얼마나 안정적으로 읽히는지는 후속 시각 점검 여지가 있다.
- 워크트리에는 이번 범위 밖의 기존 modified/untracked 파일이 계속 남아 있으므로, 후속 commit 시 포함 범위를 다시 확인해야 한다.
