# /settings/data-sources 운영 체크리스트

## 목적
- "/settings/data-sources"를 dev 운영 화면으로 점검할 때, 어떤 값이 실제 연결 확인인지와 어떤 값이 read-only 최신 상태인지 혼동하지 않도록 기준을 고정합니다.
- 사용자 노출 경로는 유지하되, dev 전용 진단 정보는 안전한 운영 판단 보조로만 사용합니다.

## 1. 기본 상태 확인
1. 소스 카드에서 `configured/missing`과 `필요 ENV`를 먼저 확인합니다.
2. `missing`이면 키 원문을 찾지 말고 .env.local의 문서화된 ENV 이름만 다시 확인합니다.
3. `OpenDART`는 아래 별도 카드에서 key/configured, indexExists, generatedAt, count를 같이 봅니다.

## 2. 최근 연결 확인
1. `연결 테스트` 버튼이 있는 소스는 카드 하단 `최근 연결 확인`을 먼저 봅니다.
2. 이 값은 dev 브라우저 localStorage 기준이라 브라우저를 바꾸거나 저장소를 지우면 사라질 수 있습니다.
3. 사용자 도움 연결 카드의 `최근 연결 확인`은 같은 페이지에서 방금 실행한 ping 결과를 read-only로 다시 보여주는 용도입니다.
4. ping 결과의 `기준일/asOf`, `건수`, `월`은 실제 응답 요약만 보여주며 투자 판단이나 정책 확정에 쓰지 않습니다.
5. production에서는 `최근 연결 확인`, fallback/쿨다운 진단, 최근 오류 목록을 숨기고, `운영 최신 기준`만 read-only로 유지합니다.

## 3. ping 없는 카드의 운영 최신 기준
1. `기업 공시 모니터링` 카드와 `재무설계 기준금리 참고` 카드는 `/api/dev/data-sources/health`를 바탕으로 read-only `운영 최신 기준`을 보여줍니다.
2. 이 블록은 실제 연결 테스트가 아니라, 저장된 최신 기준 시각과 기준일을 운영 판단용으로 다시 붙여 보여주는 용도입니다.
3. DART 카드는 회사 검색 인덱스의 최신 생성 시각(`generatedAt`)과 건수를 보여주며, 신규 공시 접수시각 자체와는 다릅니다.
4. planning 카드는 latest 가정 스냅샷의 기준일(`asOf`)과 최신 동기화 시각(`fetchedAt`)을 보여줍니다.
5. 스냅샷이 없거나 읽기 실패면 `주의`로 표시하고, planning 계산 기준이 비어 있거나 동기화 점검이 필요하다는 뜻입니다.

## 4. 이상 징후 해석
1. `최근 연결 확인`은 정상인데 `운영 최신 기준`이 비어 있으면, 연결 가능한 소스와 운영 최신 스냅샷 소스가 다른 경우일 수 있습니다.
2. `OpenDART`가 `configured`인데 `corpCodes 인덱스`가 `주의`면 아래 OpenDART 카드에서 인덱스 생성 여부를 다시 확인합니다.
3. `planning` 카드가 `주의`면 /ops/assumptions 또는 assumptions 동기화 루틴에서 latest snapshot 상태를 확인합니다.
4. 선택 API 확장 후보는 `노출 전 체크`를 통과하기 전까지 사용자 기본 흐름에 직접 연결하지 않습니다.

## 5. mock/replay 해석
1. `replayEnabled=yes`는 최근 스냅샷 재생 가능 상태를 뜻하며, live upstream 성공과 같은 의미는 아닙니다.
2. 일부 ping은 `PUBLIC_APIS_FALLBACK_TO_MOCK`가 켜져 있으면 mock/fallback 데이터로 200을 반환할 수 있습니다.
3. 특히 국토부 매매·전월세 ping은 upstream 오류가 있어도 fallback/mock 경로로 회복될 수 있으니, `최근 연결 확인`만으로 live 상태를 단정하지 않습니다.
4. live 여부를 분리해서 보고 싶으면 아래 진단 표의 `replayEnabled`, `lastSnapshotGeneratedAt`, 최근 오류 목록을 같이 확인합니다.

## 6. 권장 검증 명령
- `pnpm test tests/data-source-user-impact.test.ts tests/data-source-impact-ping.test.ts tests/data-source-impact-health.test.ts tests/data-sources-status.test.ts`
- `pnpm lint`
- `pnpm build`
- `pnpm planning:v2:prod:smoke`
  - production 전용 스모크에서 `/settings/data-sources`가 read-only `운영 최신 기준`을 렌더하고 dev 전용 진단을 숨기는지 같이 확인합니다.
  - dev 서버가 `.next`를 점유 중이면 build가 격리 distDir로 우회될 수 있고, 이 스모크는 마지막 격리 build도 자동 재사용합니다.
- `pnpm e2e:pw tests/e2e/data-sources-settings.spec.ts --workers=1`
- `pnpm e2e:rc:data-sources`
- `pnpm e2e:rc`
  - 기본 RC 묶음에 `/settings/data-sources`를 포함합니다.
  - 이유: `docs/current-screens.md`에 있는 실제 화면이고, OPENDART/planning의 read-only 최신 기준과 ping 반영 계약을 같이 검증해야 운영 회귀를 빨리 잡을 수 있기 때문입니다.

## 7. 운영 공유 산출물
1. `/ops/support`에서 Support Bundle을 내보내면 `data_source_impact_summary.json`에 `사용자 도움 카드 기준 요약`이 함께 포함됩니다.
2. 이 파일은 `/settings/data-sources`의 read-only `운영 최신 기준`과 health API 집계 요약을 운영자 공유용으로 그대로 재사용한 것입니다.
3. audit 로그는 이벤트 추적용이므로, 카드 기준 요약 확인은 audit보다 Support Bundle export를 우선합니다.
