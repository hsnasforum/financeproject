# 2026-03-16 P3-1 데이터 신뢰 허브 1차 정리

## 변경 파일
- `src/app/settings/data-sources/page.tsx`
- `src/components/DataSourceStatusCard.tsx`
- `src/components/DataSourceImpactCardsClient.tsx`
- `src/components/OpenDartStatusCard.tsx`
- `analysis_docs/v2/financeproject_next_stage_plan.md`
- `work/3/16/2026-03-16-p3-1-data-trust-hub-first-pass.md`

## 사용 skill
- `dart-data-source-hardening`: data-source 화면을 사용자 신뢰 허브로 재구성할 때, source 계산이나 fallback 사실은 유지한 채 표현과 위계만 조정하는 기준을 잡는 데 사용.
- `planning-gate-selector`: route 변경 없이 page/UI 변경만 있었으므로 `pnpm build` 중심의 최소 검증 세트를 고르는 데 사용.
- `work-log-closeout`: 이번 라운드의 변경 이유, 검증, 남은 리스크를 `/work` 형식으로 정리하는 데 사용.

## 변경 이유
- `/products/*` 화면에서 운영성 경고를 설정 화면으로 넘긴 뒤, `/settings/data-sources`가 사용자용 데이터 신뢰 허브 역할을 더 분명히 가져야 했습니다.
- 기존 페이지는 기능은 충분했지만 status 카드와 OpenDART 카드가 운영 진단 톤을 강하게 유지하고 있어, 사용자 질문 중심 trust hub로 읽히는 순서와 문구가 부족했습니다.
- 이번 라운드는 source 계산이나 API 계약은 건드리지 않고, 문구와 섹션 위계를 최소 범위로 정리하는 1차 배치입니다.

## 핵심 변경
- `/settings/data-sources` 상단에 trust summary를 추가하고, 사용자 도움 연결 → 데이터별 최신 기준 → 공시 데이터 연결 상태 → 확장 후보 → 상세 운영 진단 순으로 읽는 순서를 다시 잡았습니다.
- `DataSourceImpactCardsClient` 설명 문구를 사용자 질문 중심으로 바꾸고, impact 카드가 trust hub의 첫 핵심 본문으로 읽히게 했습니다.
- `DataSourceStatusCard`는 production 기준으로 raw 상태 코드 대신 `연결 준비됨`, `설정 필요`, `점검 필요` 같은 쉬운 상태 문구와 사용자 영향 설명을 먼저 보여 주도록 바꿨습니다.
- `OpenDartStatusCard`는 회사 검색/공시 상세에 어떤 기준이 쓰이는지 먼저 설명하고, 개발용 인덱스 관리와 파일 경로는 dev 전용 정보로만 뒤로 내렸습니다.
- `DataSourceHealthTable`와 detailed diagnostics는 하단 `상세 운영 진단` 섹션으로 묶어, 사용자용 trust 정보보다 뒤에서 참고용으로만 보이게 했습니다.

## 검증
- `pnpm build`
- `git diff --check -- analysis_docs/v2/financeproject_next_stage_plan.md src/app/settings/data-sources/page.tsx src/components/DataSourceStatusCard.tsx src/components/DataSourceImpactCardsClient.tsx src/components/OpenDartStatusCard.tsx work/3/16/2026-03-16-p3-1-data-trust-hub-first-pass.md`

## 남은 리스크
- `DataSourceHealthTable` 자체는 여전히 운영 진단용 표와 영문/운영 용어를 포함하고 있으나, 이번 라운드에서는 dev 전용 하단 섹션으로 위계만 낮췄습니다.
- `DataSourceStatusCard`의 사용자 영향 설명은 현재 status state 기반의 일반 문구이므로, source별 더 정교한 영향 문구는 후속 라운드에서만 검토합니다.
- `/recommend`, 청약 공고 화면의 운영성 배너 정리는 별도 dirty와 충돌하므로 이번 라운드에 섞지 않았습니다.
