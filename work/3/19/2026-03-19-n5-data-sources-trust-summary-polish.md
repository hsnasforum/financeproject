# 2026-03-19 N5 settings data-sources trust summary polish

## 변경 파일

- `src/app/settings/data-sources/page.tsx`
- `src/components/DataSourceImpactCardsClient.tsx`
- `src/components/DataSourceStatusCard.tsx`
- `src/components/OpenDartStatusCard.tsx`
- `work/3/19/2026-03-19-n5-data-sources-trust-summary-polish.md`

## 사용 skill

- `finance-skill-routing`: 이번 배치를 `N5 settings / trust hub surface`의 copy/helper/summary polish로 제한하고, route나 운영 정책 변경으로 커지지 않게 유지하는 데 사용
- `planning-gate-selector`: data-sources trust hub UI 변경에 맞춰 `git diff --check`, `pnpm lint`, `pnpm build`, data-sources 전용 e2e까지 필요한 검증 범위를 고르는 데 사용
- `dart-data-source-hardening`: `/settings/data-sources`와 OpenDART 상태 카드의 freshness/helper 문구가 실제 data-source 실패 모드와 어긋나지 않도록, raw 운영 정보와 사용자용 요약을 분리하는 데 사용
- `work-log-closeout`: 실제 변경 파일, 실행한 검증, 남은 리스크를 `/work` 형식으로 남기는 데 사용

## 변경 이유

- `/settings/data-sources` 상단은 trust hub 역할을 유지하면서도, 사용자가 “지금 어떤 데이터를 기준으로 읽고 있는가”를 먼저 이해하기 쉽게 정리할 필요가 있었다.
- 데이터별 상태 카드와 OpenDART 카드에는 raw 운영 메모, 내부 식별자, 개발용 관리 정보가 아직 사용자 영향과 비슷한 무게로 보이는 부분이 있었다.
- `N5` 문서 기준으로 이번 배치는 copy/helper/위계 polish만 다루고, route, API, data contract, 운영 로직은 건드리지 않아야 했다.

## 핵심 변경

- `/settings/data-sources` 상단 요약을 `무엇을 먼저 읽는가 -> 비거나 늦으면 무엇이 달라지는가 -> 상세 운영 진단은 어디서 보는가` 순서로 정리하고, 같은 페이지 안에서 바로 이동하는 얇은 링크를 추가했다.
- `DataSourceImpactCardsClient`를 사용자 질문 기준 읽기 순서로 더 분명하게 다듬고, 각 질문 카드에서 `지금 읽는 기준`과 `이어서 볼 화면`이 먼저 보이도록 정리했다.
- `DataSourceStatusCard`는 사용자 영향과 현재 읽는 기준을 먼저 보여 주고, 내부 식별자·env·운영 메모는 `개발용 연결 조건과 메모 보기` 접힘 영역으로 내렸다.
- `OpenDartStatusCard`는 상태별 사용자용 한줄 요약을 먼저 추가하고, 누락 시 상단에는 사용자 영향만 남기고 raw 스크립트/경로 힌트는 개발용 인덱스 정보 접힘 영역으로 옮겼다.

## 검증

- `git diff --check -- src/app/settings/data-sources/page.tsx src/components/DataSourceImpactCardsClient.tsx src/components/DataSourceStatusCard.tsx src/components/OpenDartStatusCard.tsx`
- `pnpm lint`
  - 에러 없이 통과
  - 기존 unrelated warning 30건은 그대로 남아 있음
- `pnpm build`
- `pnpm e2e:rc:data-sources`
  - 통과
  - `tests/e2e/data-sources-settings.spec.ts` 1건 green 확인

## 남은 리스크

- 이번 라운드는 문구와 위계만 다듬었기 때문에, 실제 사용자가 상단 요약과 카드 순서를 더 쉽게 이해하는지는 별도 사용성 확인이 더 필요하다.
- OpenDART 누락 상태의 raw 운영 메시지는 개발용 접힘 영역에만 남겼지만, 개발 환경에서는 여전히 스크립트/경로 힌트가 보이므로 운영자용 표현 수위는 후속 점검 여지가 있다.
- 워크트리에는 이번 범위 밖의 기존 modified/untracked 파일이 계속 남아 있으므로, 후속 commit 시 포함 범위를 엄격히 확인해야 한다.
