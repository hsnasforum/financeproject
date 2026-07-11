# Planning v3 refresh owner 계약

## 목적

뉴스와 경제지표의 UI 설정, 수동 실행, 예약 실행이 서로 다른 설정과 저장소를 읽지 않도록 canonical owner를 단계적으로 통합합니다.

이 문서는 Issue #239의 첫 단계인 경제지표 계약을 기록합니다. 뉴스 runner와 SQLite/file-store 전환은 사용자 namespace와 기존 reader 계약을 확인한 뒤 별도 PR에서 처리합니다.

## 경제지표 owner matrix

| 호출자 | 설정 owner | 실행 owner | 출력 owner |
| --- | --- | --- | --- |
| 지표 specs API/UI | v3 effective config + specOverrides.json | 해당 없음 | specOverrides.json |
| pnpm indicators:refresh | v3 effective config | planning v3 indicators runner | indicators/series, indicators/meta, indicators/state.json |
| daily refresh | pnpm indicators:refresh | 같은 v3 runner | 같은 indicators root |
| v3 refresh-all | pnpm indicators:refresh | 같은 v3 runner | 같은 indicators root |
| src/lib/indicators/refresh.ts 직접 import | compatibility only | legacy runner | 새 운영 caller에서 사용 금지 |

package script는 더 이상 legacy runner를 호출하지 않습니다. daily refresh와 refresh-all은 아직 package command adapter를 실행하지만, 그 command가 canonical v3 runner만 호출하므로 설정·state·artifact owner는 하나입니다.

## effective config 우선순위

1. config/indicators-sources.json과 config/indicators-series.json이 모두 있으면 두 파일을 compatibility base로 읽습니다.
2. 두 파일이 모두 없으면 API preview와 `--dry` 검증에만 v3 built-in source/spec를 base로 사용합니다. non-dry refresh는 fixture가 실제 데이터로 저장되지 않도록 쓰기 전에 중단합니다.
3. 두 파일 중 하나만 있거나 JSON/schema/source 참조가 잘못되면 refresh를 중단합니다.
4. indicators/specOverrides.json의 runtime override가 동일 series ID의 최종 우선순위입니다.
5. legacy compatibility base가 있을 때 v3 fixture series를 자동으로 합치지 않습니다. runtime override가 fixture source를 명시적으로 참조할 수 있도록 source definition만 유지합니다.
6. malformed 또는 중복 runtime override는 빈 설정으로 축약하지 않고 오류로 중단합니다.

## 저장·freshness 계약

- series JSONL과 meta, state는 v3 store가 canonical owner입니다.
- 기존 state.json의 source별 etag, lastModified, cursor는 제거하지 않습니다. v3 series 상태와 같은 envelope에 보존하며 legacy reader/writer도 v3 series 필드를 유지합니다.
- 기존 월·분기·연도 날짜 표현과 신규 표현이 같은 기간을 가리킬 때 값이 같으면 중복으로 건너뜁니다.
- 같은 기간의 값이 다르면 기존 JSONL을 수정하지 않고 해당 series를 PARSE 오류로 기록합니다. 자동으로 어느 값을 선택하지 않습니다.
- state.json이 malformed/schema-invalid이면 원문을 덮어쓰지 않고 refresh 전체를 중단합니다.
- source 일부 실패는 errors와 partial 로그로 남기고 package command가 실패 코드로 종료합니다. daily refresh 자체의 최종 fail-closed 정책은 Issue #240 범위입니다.

## CLI 호환

- --dry는 외부 API를 호출하지 않고 기존과 같은 빈도별 deterministic observation 수를 임시/지정 data root에 기록합니다. built-in fixture base는 이 모드에서만 갱신 입력으로 허용합니다.
- --strict 인자는 계속 허용합니다. canonical command는 strict 유무와 관계없이 source error가 있으면 실패 코드로 종료해 예약 실행이 부분 실패를 성공으로 오인하지 않게 합니다.
- alert 평가는 canonical effective specs와 v3 indicator store를 사용합니다. disabled source 또는 disabled override series는 stale JSONL이 남아 있어도 평가 대상에서 제외합니다.

## 영향

- Public API URL과 성공 response wrapper는 변경하지 않습니다.
- malformed runtime override는 500 STORAGE_CORRUPT, 잘못된 compatibility config는 500 INDICATOR_CONFIG_INVALID envelope로 반환합니다.
- DB query/schema와 cache/revalidation은 변경하지 않습니다.
- stored series/meta 경로와 state.json 경로는 유지합니다. destructive migration은 없습니다.
- 실제 운영 데이터 rewrite는 수행하지 않습니다. 충돌은 fixture test로만 검증하고 운영 데이터에서는 fail-closed 처리합니다.

## 뉴스 후속 전제

- 예약 refresh가 어느 사용자 namespace를 대상으로 하는지 먼저 확정합니다.
- 기존 news.sqlite reader와 v3 per-user file/cache reader의 소비자를 전수 확인합니다.
- 두 조건이 정해지기 전에는 scripts/news_refresh.mjs를 v3 runner로 전환하지 않습니다.
